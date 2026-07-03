import { CostCalculator } from '../costCalculator';
import { MeteringConfig } from '../types';

const baseConfig: MeteringConfig = {
  prometheusUrl: 'http://prometheus:9090',
  windowHours: 24,
  retentionDays: 90,
  costModel: {
    cpuCostPerCorePerHour: 0.048,
    memoryCostPerGBPerHour: 0.006,
  },
};

describe('CostCalculator', () => {
  const calc = new CostCalculator(baseConfig);

  it('calculates hourly cost correctly', () => {
    const result = calc.calculate('component:default/my-app', 'my-ns', 'my-app', {
      cpuCores: 2,
      memGiB: 4,
      cpuRequestCores: 2,
      memRequestGiB: 4,
      replicaCount: 2,
    });

    expect(result.cpuCostPerHour).toBeCloseTo(2 * 0.048);
    expect(result.memoryCostPerHour).toBeCloseTo(4 * 0.006);
    expect(result.hourlyCost).toBeCloseTo(2 * 0.048 + 4 * 0.006);
  });

  it('handles zero metrics', () => {
    const result = calc.calculate('component:default/idle', 'ns', 'idle', {
      cpuCores: 0,
      memGiB: 0,
      cpuRequestCores: 0,
      memRequestGiB: 0,
      replicaCount: 0,
    });

    expect(result.hourlyCost).toBe(0);
    expect(result.cpuCostPerHour).toBe(0);
    expect(result.memoryCostPerHour).toBe(0);
  });

  it('uses custom cost model rates', () => {
    const expensiveConfig: MeteringConfig = {
      ...baseConfig,
      costModel: { cpuCostPerCorePerHour: 1.0, memoryCostPerGBPerHour: 0.1 },
    };
    const expensiveCalc = new CostCalculator(expensiveConfig);

    const result = expensiveCalc.calculate('component:default/app', 'ns', 'app', {
      cpuCores: 10,
      memGiB: 100,
      cpuRequestCores: 10,
      memRequestGiB: 100,
      replicaCount: 5,
    });

    expect(result.hourlyCost).toBeCloseTo(10 * 1.0 + 100 * 0.1);
  });

  it('correctly propagates entity metadata', () => {
    const result = calc.calculate(
      'component:production/web-server',
      'production',
      'web-server',
      { cpuCores: 1, memGiB: 2, cpuRequestCores: 1, memRequestGiB: 2, replicaCount: 1 },
    );

    expect(result.entityRef).toBe('component:production/web-server');
    expect(result.namespace).toBe('production');
    expect(result.deployment).toBe('web-server');
    expect(result.windowHours).toBe(24);
    expect(result.sampledAt).toBeTruthy();
  });

  it('projects daily and monthly costs correctly', () => {
    const result = calc.calculate('component:default/app', 'ns', 'app', {
      cpuCores: 1,
      memGiB: 1,
      cpuRequestCores: 1,
      memRequestGiB: 1,
      replicaCount: 1,
    });

    const daily = result.hourlyCost * 24;
    const monthly = result.hourlyCost * 24 * 30;

    expect(daily).toBeCloseTo((0.048 + 0.006) * 24);
    expect(monthly).toBeCloseTo((0.048 + 0.006) * 24 * 30);
  });
});
