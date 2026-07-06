import { z } from 'zod';

export const chargeModeSchema = z.enum(['usage', 'requests', 'limits', 'max']).default('max');

export type ChargeMode = z.infer<typeof chargeModeSchema>;

export const costModelSchema = z.object({
  cpuCostPerCorePerHour: z.number().positive(),
  memoryCostPerGBPerHour: z.number().positive(),
});

export const meteringConfigSchema = z.object({
  prometheusUrl: z.string().url(),
  bearerToken: z.string().optional(),
  chargeMode: chargeModeSchema,
  windowHours: z.number().positive().default(24),
  retentionDays: z.number().positive().default(90),
  costModel: costModelSchema,
});

export type MeteringConfig = z.infer<typeof meteringConfigSchema>;

export interface CostResult {
  entityRef: string;
  namespace: string;
  deployment: string;
  chargeMode: ChargeMode;
  cpuCores: number;
  memGiB: number;
  cpuCostPerHour: number;
  memoryCostPerHour: number;
  hourlyCost: number;
  cpuRequestCores: number;
  memRequestGiB: number;
  cpuLimitCores: number;
  memLimitGiB: number;
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
