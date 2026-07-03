import { MeteringConfig, CostResult } from './types';
import { PrometheusMetrics } from './prometheusClient';

export class CostCalculator {
  private readonly config: MeteringConfig;

  constructor(config: MeteringConfig) {
    this.config = config;
  }

  calculate(
    entityRef: string,
    namespace: string,
    deployment: string,
    metrics: PrometheusMetrics,
  ): CostResult {
    const { cpuCostPerCorePerHour, memoryCostPerGBPerHour } =
      this.config.costModel;

    const cpuCostPerHour = metrics.cpuCores * cpuCostPerCorePerHour;
    const memoryCostPerHour = metrics.memGiB * memoryCostPerGBPerHour;

    return {
      entityRef,
      namespace,
      deployment,
      cpuCores: metrics.cpuCores,
      memGiB: metrics.memGiB,
      cpuCostPerHour,
      memoryCostPerHour,
      hourlyCost: cpuCostPerHour + memoryCostPerHour,
      cpuRequestCores: metrics.cpuRequestCores,
      memRequestGiB: metrics.memRequestGiB,
      replicaCount: metrics.replicaCount,
      windowHours: this.config.windowHours,
      sampledAt: new Date().toISOString(),
    };
  }
}
