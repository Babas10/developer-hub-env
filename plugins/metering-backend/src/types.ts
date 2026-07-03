export interface MeteringConfig {
  prometheusUrl: string;
  windowHours: number;
  retentionDays: number;
  costModel: {
    cpuCostPerCorePerHour: number;
    memoryCostPerGBPerHour: number;
  };
}

export interface CostResult {
  entityRef: string;
  namespace: string;
  deployment: string;
  cpuCores: number;
  memGiB: number;
  cpuCostPerHour: number;
  memoryCostPerHour: number;
  hourlyCost: number;
  cpuRequestCores: number;
  memRequestGiB: number;
  replicaCount: number;
  windowHours: number;
  sampledAt: string;
}

export interface CostSnapshot {
  id: number;
  entityRef: string;
  namespace: string;
  deployment: string;
  cpuCores: number;
  memGiB: number;
  hourlyCost: number;
  sampledAt: Date;
}
