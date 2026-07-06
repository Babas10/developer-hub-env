import path from 'path';
import { Knex } from 'knex';
import { CostSnapshot } from './types';

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
    sampled_at: new Date(),
  });
}

export async function getHistory(
  knex: Knex,
  entityRef: string,
  days: number,
): Promise<CostSnapshot[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await knex('cost_snapshots')
    .where('entity_ref', entityRef)
    .where('sampled_at', '>=', since)
    .orderBy('sampled_at', 'asc')
    .select('*');

  return rows.map(
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
}

export async function pruneOldSnapshots(
  knex: Knex,
  retentionDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const deleted = await knex('cost_snapshots')
    .where('sampled_at', '<', cutoff)
    .delete();

  return deleted;
}
