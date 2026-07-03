import {
  LoggerService,
  SchedulerService,
  DatabaseService,
  AuthService,
} from '@backstage/backend-plugin-api';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { ComponentEntity } from '@backstage/catalog-model';
import { LRUCache } from 'lru-cache';
import { Knex } from 'knex';
import { PrometheusClient } from './prometheusClient';
import { CostCalculator } from './costCalculator';
import { MeteringConfig } from './types';
import { insertSnapshot, pruneOldSnapshots } from './database';

const ANNOTATION_KUBERNETES_NAMESPACE = 'backstage.io/kubernetes-namespace';
const ANNOTATION_KUBERNETES_ID = 'backstage.io/kubernetes-id';

export function createSnapshotScheduler(
  config: MeteringConfig,
  logger: LoggerService,
  scheduler: SchedulerService,
  database: DatabaseService,
  catalog: CatalogService,
  auth: AuthService,
): void {
  const prometheusClient = new PrometheusClient(
    config.prometheusUrl,
    logger,
    config.bearerToken,
  );
  const costCalculator = new CostCalculator(config);

  // Prevent writing two snapshots within 50 min for the same entity (scheduler jitter guard)
  const snapshotCache = new LRUCache<string, boolean>({
    max: 1000,
    ttl: 50 * 60 * 1000,
  });

  scheduler.scheduleTask({
    id: 'metering-snapshot',
    frequency: { hours: 1 },
    timeout: { minutes: 10 },
    fn: async () => {
      logger.info('Metering: running hourly cost snapshot');
      const knex = (await database.getClient()) as unknown as Knex;

      const pruned = await pruneOldSnapshots(knex, config.retentionDays);
      if (pruned > 0) {
        logger.debug(`Metering: pruned ${pruned} old snapshots`);
      }

      const credentials = await auth.getOwnServiceCredentials();

      const { items } = await catalog.getEntities(
        { filter: [{ kind: 'Component' }], fields: ['metadata'] },
        { credentials },
      );

      const annotated = (items as ComponentEntity[]).filter(
        e => e.metadata.annotations?.[ANNOTATION_KUBERNETES_NAMESPACE],
      );

      logger.info(
        `Metering: snapshotting ${annotated.length} annotated entities`,
      );

      for (const entity of annotated) {
        const namespace =
          entity.metadata.annotations![ANNOTATION_KUBERNETES_NAMESPACE];
        const deployment =
          entity.metadata.annotations?.[ANNOTATION_KUBERNETES_ID] ||
          entity.metadata.name;
        const entityRef = `component:${entity.metadata.namespace ?? 'default'}/${entity.metadata.name}`;

        if (snapshotCache.has(entityRef)) continue;

        try {
          const metrics = await prometheusClient.getMetrics(
            namespace,
            deployment,
            1,
          );
          const result = costCalculator.calculate(
            entityRef,
            namespace,
            deployment,
            metrics,
          );

          await insertSnapshot(knex, {
            entityRef: result.entityRef,
            namespace: result.namespace,
            deployment: result.deployment,
            cpuCores: result.cpuCores,
            memGiB: result.memGiB,
            hourlyCost: result.hourlyCost,
          });

          snapshotCache.set(entityRef, true);
        } catch (err) {
          logger.warn(
            `Metering: failed to snapshot ${entityRef}: ${String(err)}`,
          );
        }
      }
    },
  });
}
