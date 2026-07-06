import {
  createApiFactory,
  createApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

export type ChargeMode = 'usage' | 'requests' | 'limits' | 'max';

export interface CostResult {
  entityRef: string;
  namespace: string;
  deployment: string;
  chargeMode: ChargeMode;
  cpuCores: number;
  memGiB: number;
  gpuCount: number;
  gpuMemGiB: number;
  cpuCostPerHour: number;
  memoryCostPerHour: number;
  gpuCostPerHour: number;
  hourlyCost: number;
  cpuRequestCores: number;
  memRequestGiB: number;
  cpuLimitCores: number;
  memLimitGiB: number;
  replicaCount: number;
  windowHours: number;
  sampledAt: string;
}

export interface CostHistoryPoint {
  sampledAt: string;
  hourlyCost: number;
  cpuCores: number;
  memGiB: number;
}

export interface MeteringApi {
  getCost(params: {
    namespace: string;
    deployment: string;
    entityRef: string;
    windowHours?: number;
  }): Promise<CostResult>;

  getCostHistory(params: {
    entityRef: string;
    days?: number;
  }): Promise<CostHistoryPoint[]>;
}

export const meteringApiRef = createApiRef<MeteringApi>({
  id: 'plugin.metering.service',
});

class MeteringClient implements MeteringApi {
  private readonly discoveryApi: typeof discoveryApiRef.T;
  private readonly fetchApi: typeof fetchApiRef.T;

  constructor(
    discoveryApi: typeof discoveryApiRef.T,
    fetchApi: typeof fetchApiRef.T,
  ) {
    this.discoveryApi = discoveryApi;
    this.fetchApi = fetchApi;
  }

  private async getBaseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('metering');
  }

  async getCost(params: {
    namespace: string;
    deployment: string;
    entityRef: string;
    windowHours?: number;
  }): Promise<CostResult> {
    const base = await this.getBaseUrl();
    const qs = new URLSearchParams({
      namespace: params.namespace,
      deployment: params.deployment,
      entityRef: params.entityRef,
      ...(params.windowHours && { windowHours: String(params.windowHours) }),
    });

    const res = await this.fetchApi.fetch(`${base}/cost?${qs}`);
    if (!res.ok) {
      throw new Error(`Metering API error (${res.status}): ${await res.text()}`);
    }
    return res.json();
  }

  async getCostHistory(params: {
    entityRef: string;
    days?: number;
  }): Promise<CostHistoryPoint[]> {
    const base = await this.getBaseUrl();
    const qs = new URLSearchParams({
      entityRef: params.entityRef,
      ...(params.days && { days: String(params.days) }),
    });

    const res = await this.fetchApi.fetch(`${base}/cost/history?${qs}`);
    if (!res.ok) {
      throw new Error(
        `Metering history API error (${res.status}): ${await res.text()}`,
      );
    }
    return res.json();
  }
}

export const meteringApiFactory = createApiFactory({
  api: meteringApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
  },
  factory: ({ discoveryApi, fetchApi }) =>
    new MeteringClient(discoveryApi, fetchApi),
});
