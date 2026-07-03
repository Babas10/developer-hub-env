import { Knex } from 'knex';
import { CostSnapshot } from './types';

export async function runMigrations(knex: Knex): Promise<void> {
  await knex.schema.createTableIfNotExists('cost_snapshots', table => {
    table.increments('id').primary();
    table.text('entity_ref').notNullable();
    table.text('namespace').notNullable();
    table.text('deployment').notNullable();
    table.float('cpu_cores').notNullable();
    table.float('mem_gib').notNullable();
    table.float('hourly_cost').notNullable();
    table.timestamp('sampled_at').notNullable().defaultTo(knex.fn.now());
    table.index(['entity_ref', 'sampled_at']);
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
      sampled_at: Date;
    }) => ({
      id: r.id,
      entityRef: r.entity_ref,
      namespace: r.namespace,
      deployment: r.deployment,
      cpuCores: r.cpu_cores,
      memGiB: r.mem_gib,
      hourlyCost: r.hourly_cost,
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
