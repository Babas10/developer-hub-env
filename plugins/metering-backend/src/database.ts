import path from 'path';
import { Knex } from 'knex';
import { CostSnapshot } from './types';

/** Returns true when running against SQLite (local dev / tests). */
function isSQLite(knex: Knex): boolean {
  const client: string = (knex.client as any).config?.client ?? '';
  return client === 'sqlite3' || client === 'better-sqlite3';
}

/**
 * SQL fragment that truncates a timestamp column to the first day of its month.
 * Dialect-aware: SQLite uses strftime, PostgreSQL uses date_trunc.
 */
function monthTruncExpr(knex: Knex, column: string): string {
  return isSQLite(knex)
    ? `strftime('%Y-%m-01', ${column})`
    : `date_trunc('month', ${column})::date`;
}

/**
 * Run all pending Knex migrations from the migrations/ directory.
 *
 * Knex tracks applied migrations in a `knex_migrations` table it manages
 * automatically — this call is idempotent and safe to re-run on every
 * plugin startup.
 *
 * To add a new migration: create migrations/NNN_<description>.ts with an
 * `up` function (and optionally a `down` function for rollbacks).
 */
export async function runMigrations(knex: Knex): Promise<void> {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  await knex.migrate.latest({
    directory: migrationsDir,
    // Knex needs a require hook for .ts files during local dev; in the compiled
    // plugin the migrations are already .js files in the same relative path.
    loadExtensions: ['.js', '.ts'],
  });
}

export async function insertSnapshot(
  knex: Knex,
  snapshot: Omit<CostSnapshot, 'id' | 'sampledAt'>,
): Promise<void> {
  await knex('cost_snapshots').insert({
    entity_ref: snapshot.entityRef,
    namespace: snapshot.namespace,
    deployment: snapshot.deployment,
    cpu_cores: snapshot.cpuCores,
    mem_gib: snapshot.memGiB,
    hourly_cost: snapshot.hourlyCost,
    gpu_count: snapshot.gpuCount,
    gpu_cost: snapshot.gpuCost,
    sampled_at: new Date().toISOString(),
  });
}

/**
 * Returns a unified time series for an entity spanning both storage tiers:
 *   - cost_snapshots       (hourly, recent — within the requested window)
 *   - cost_monthly_rollups (monthly aggregates — older data promoted by the rollup job)
 *
 * Monthly rollup rows are synthesised into CostSnapshot shape using:
 *   hourlyCost = total_cost / sample_count   (average hourly cost for that month)
 *   sampledAt  = month_start                 (first day of the month)
 *
 * The two result sets are merged and sorted ascending by sampledAt so the
 * caller always receives a single ordered series regardless of data age.
 */
export async function getHistory(
  knex: Knex,
  entityRef: string,
  days: number,
): Promise<CostSnapshot[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Tier 1: hourly snapshots (recent data)
  const hourlyRows = await knex('cost_snapshots')
    .where('entity_ref', entityRef)
    .where('sampled_at', '>=', since.toISOString())
    .orderBy('sampled_at', 'asc')
    .select('*');

  const hourly: CostSnapshot[] = hourlyRows.map(
    (r: {
      id: number;
      entity_ref: string;
      namespace: string;
      deployment: string;
      cpu_cores: number;
      mem_gib: number;
      hourly_cost: number;
      gpu_count: number;
      gpu_cost: number;
      sampled_at: Date;
    }) => ({
      id: r.id,
      entityRef: r.entity_ref,
      namespace: r.namespace,
      deployment: r.deployment,
      cpuCores: r.cpu_cores,
      memGiB: r.mem_gib,
      hourlyCost: r.hourly_cost,
      gpuCount: r.gpu_count ?? 0,
      gpuCost: r.gpu_cost ?? 0,
      sampledAt: new Date(r.sampled_at),
    }),
  );

  // Tier 2: monthly rollups (older data promoted by the nightly rollup job)
  const sinceDate = since.toISOString().slice(0, 10);
  const rollupRows = await knex('cost_monthly_rollups')
    .where('entity_ref', entityRef)
    .where('month_start', '>=', sinceDate)
    .orderBy('month_start', 'asc')
    .select('*');

  const rollups: CostSnapshot[] = rollupRows.map(
    (r: {
      id: number;
      entity_ref: string;
      namespace: string;
      deployment: string;
      month_start: string;
      avg_cpu_cores: number;
      avg_mem_gib: number;
      avg_gpu_count: number;
      total_cost: number;
      sample_count: number;
    }) => ({
      id: r.id,
      entityRef: r.entity_ref,
      namespace: r.namespace,
      deployment: r.deployment,
      cpuCores: r.avg_cpu_cores,
      memGiB: r.avg_mem_gib,
      hourlyCost: r.sample_count > 0 ? r.total_cost / r.sample_count : 0,
      gpuCount: r.avg_gpu_count ?? 0,
      gpuCost: 0,
      sampledAt: new Date(r.month_start),
    }),
  );

  // Merge tiers and sort by time ascending
  return [...rollups, ...hourly].sort(
    (a, b) => a.sampledAt.getTime() - b.sampledAt.getTime(),
  );
}

export async function pruneOldSnapshots(
  knex: Knex,
  retentionDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const deleted = await knex('cost_snapshots')
    .where('sampled_at', '<', cutoff.toISOString())
    .delete();

  return deleted;
}

/**
 * ADR-05 nightly rollup: aggregates hourly snapshot rows that are older than
 * rollupAfterDays into the cost_monthly_rollups table, then deletes the source rows.
 *
 * The upsert uses ON CONFLICT (entity_ref, month_start) so re-running the job
 * for the same month is idempotent — it overwrites the previous aggregate with
 * the correct values rather than double-counting.
 *
 * Returns the number of hourly rows that were deleted after being rolled up.
 * Returns 0 if there is nothing old enough to roll up yet.
 */
export async function runMonthlyRollup(
  knex: Knex,
  rollupAfterDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rollupAfterDays);

  const monthExpr = monthTruncExpr(knex, 'sampled_at');

  // Aggregate hourly rows that are old enough into monthly groups
  const cutoffIso = cutoff.toISOString();

  const groups: Array<{
    entity_ref: string;
    namespace: string;
    deployment: string;
    month_start: string;
    avg_cpu_cores: number;
    avg_mem_gib: number;
    avg_gpu_count: number;
    total_cost: number;
    sample_count: number;
  }> = await knex('cost_snapshots')
    .where('sampled_at', '<', cutoffIso)
    .groupByRaw(`entity_ref, namespace, deployment, ${monthExpr}`)
    .select(
      'entity_ref',
      'namespace',
      'deployment',
      knex.raw(`${monthExpr} as month_start`),
      knex.raw('AVG(cpu_cores) as avg_cpu_cores'),
      knex.raw('AVG(mem_gib) as avg_mem_gib'),
      knex.raw('AVG(gpu_count) as avg_gpu_count'),
      knex.raw('SUM(hourly_cost) as total_cost'),
      knex.raw('COUNT(*) as sample_count'),
    );

  if (groups.length === 0) return 0;

  // Upsert each monthly group — idempotent on (entity_ref, month_start)
  await knex('cost_monthly_rollups')
    .insert(
      groups.map(g => ({
        entity_ref: g.entity_ref,
        namespace: g.namespace,
        deployment: g.deployment,
        month_start: g.month_start,
        avg_cpu_cores: Number(g.avg_cpu_cores),
        avg_mem_gib: Number(g.avg_mem_gib),
        avg_gpu_count: Number(g.avg_gpu_count) || 0,
        total_cost: Number(g.total_cost),
        sample_count: Number(g.sample_count),
      })),
    )
    .onConflict(['entity_ref', 'month_start'])
    .merge();

  // Delete the rolled-up hourly rows
  const deleted = await knex('cost_snapshots')
    .where('sampled_at', '<', cutoffIso)
    .delete();

  return deleted;
}
