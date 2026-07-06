import { Knex } from 'knex';
import { CostSnapshot } from './types';
import * as migration001 from './migrations/001_initial_cost_snapshots';
import * as migration002 from './migrations/002_add_gpu_columns';
import * as migration003 from './migrations/003_create_cost_monthly_rollups';

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

// Ordered list of all migrations. Static imports ensure the build tool
// includes every migration file in the compiled output — the previous
// path.resolve(__dirname, 'migrations') directory scan only worked in
// local TypeScript dev because the compiled dist/ never contained a
// migrations/ subdirectory.
const MIGRATIONS = [
  { name: '001_initial_cost_snapshots', module: migration001 },
  { name: '002_add_gpu_columns',        module: migration002 },
  { name: '003_create_cost_monthly_rollups', module: migration003 },
] as const;

const migrationSource = {
  getMigrations: () => Promise.resolve([...MIGRATIONS]),
  getMigrationName: (m: (typeof MIGRATIONS)[number]) => m.name,
  getMigration:     (m: (typeof MIGRATIONS)[number]) => Promise.resolve(m.module),
};

/**
 * Run all pending Knex migrations.
 *
 * Migrations are registered via static imports so the build tool bundles
 * them into the compiled output. Knex tracks applied migrations in its own
 * knex_migrations table — this call is idempotent and safe on every startup.
 *
 * To add a new migration: create migrations/NNN_<description>.ts, add it to
 * the MIGRATIONS array above, and bump the import at the top of this file.
 */
export async function runMigrations(knex: Knex): Promise<void> {
  await knex.migrate.latest({ migrationSource });
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
 * The upsert is ADDITIVE: when a row already exists for (entity_ref, month_start),
 * total_cost and sample_count are summed and the running averages are recomputed as
 * weighted averages so that each nightly run correctly accumulates the new slice of
 * hourly rows rather than overwriting the stored aggregate.
 *
 * This design is safe for the normal usage pattern where the cutoff is a moving
 * window (now − rollupAfterDays): new hourly rows age past it each night, get
 * aggregated into the monthly row, and are then deleted — each night's slice is
 * non-overlapping with previous runs for the same month.
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

  // Upsert each monthly group with an ADDITIVE merge on conflict.
  // Both SQLite and PostgreSQL support the `excluded` pseudo-table in DO UPDATE.
  // Means are recomputed as weighted averages so accumulated slices combine correctly.
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
    .merge({
      total_cost: knex.raw(
        'cost_monthly_rollups.total_cost + excluded.total_cost',
      ),
      sample_count: knex.raw(
        'cost_monthly_rollups.sample_count + excluded.sample_count',
      ),
      avg_cpu_cores: knex.raw(
        '(cost_monthly_rollups.avg_cpu_cores * cost_monthly_rollups.sample_count' +
          ' + excluded.avg_cpu_cores * excluded.sample_count)' +
          ' / (cost_monthly_rollups.sample_count + excluded.sample_count)',
      ),
      avg_mem_gib: knex.raw(
        '(cost_monthly_rollups.avg_mem_gib * cost_monthly_rollups.sample_count' +
          ' + excluded.avg_mem_gib * excluded.sample_count)' +
          ' / (cost_monthly_rollups.sample_count + excluded.sample_count)',
      ),
      avg_gpu_count: knex.raw(
        '(cost_monthly_rollups.avg_gpu_count * cost_monthly_rollups.sample_count' +
          ' + excluded.avg_gpu_count * excluded.sample_count)' +
          ' / (cost_monthly_rollups.sample_count + excluded.sample_count)',
      ),
    });

  // Delete the rolled-up hourly rows
  const deleted = await knex('cost_snapshots')
    .where('sampled_at', '<', cutoffIso)
    .delete();

  return deleted;
}
