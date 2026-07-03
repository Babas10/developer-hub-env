import React, { useState } from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useApi } from '@backstage/core-plugin-api';
import { meteringApiRef, CostResult } from '../../api';
import { CpuChart } from '../charts/CpuChart';
import { MemoryChart } from '../charts/MemoryChart';
import { CostDonut } from '../charts/CostDonut';

const ANNOTATION_K8S_NAMESPACE = 'backstage.io/kubernetes-namespace';
const ANNOTATION_K8S_ID = 'backstage.io/kubernetes-id';

type WindowOption = { label: string; hours: number };
const WINDOW_OPTIONS: WindowOption[] = [
  { label: '1h', hours: 1 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): { value?: T; loading: boolean; error?: Error } {
  const [state, setState] = React.useState<{
    value?: T;
    loading: boolean;
    error?: Error;
  }>({ loading: true });

  React.useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    fn()
      .then(value => !cancelled && setState({ value, loading: false }))
      .catch(
        error => !cancelled && setState({ loading: false, error }),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: '#f5f5f5',
        borderRadius: 8,
        padding: '12px 16px',
        minWidth: 120,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4
      style={{
        margin: '20px 0 8px',
        fontSize: 13,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#555',
      }}
    >
      {children}
    </h4>
  );
}

function WindowPicker({
  selected,
  onChange,
}: {
  selected: number;
  onChange: (h: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {WINDOW_OPTIONS.map(opt => (
        <button
          key={opt.hours}
          onClick={() => onChange(opt.hours)}
          style={{
            padding: '2px 10px',
            borderRadius: 4,
            border: '1px solid #ccc',
            background: selected === opt.hours ? '#1976d2' : 'transparent',
            color: selected === opt.hours ? '#fff' : 'inherit',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function MeteringCardContent() {
  const { entity } = useEntity();
  const meteringApi = useApi(meteringApiRef);
  const [windowHours, setWindowHours] = useState(24);

  const annotations = entity.metadata.annotations ?? {};
  const namespace = annotations[ANNOTATION_K8S_NAMESPACE];
  const deployment = annotations[ANNOTATION_K8S_ID] || entity.metadata.name;
  const entityRef = `${entity.kind.toLowerCase()}:${entity.metadata.namespace ?? 'default'}/${entity.metadata.name}`;

  const costState = useAsync<CostResult>(
    () =>
      meteringApi.getCost({ namespace, deployment, entityRef, windowHours }),
    [namespace, deployment, entityRef, windowHours],
  );

  if (!namespace) {
    return (
      <div
        style={{
          padding: 16,
          background: '#fff8e1',
          borderRadius: 8,
          fontSize: 13,
          color: '#795548',
        }}
      >
        Add the annotation{' '}
        <code>backstage.io/kubernetes-namespace</code> to this component to
        enable metering.
      </div>
    );
  }

  if (costState.error) {
    return (
      <div style={{ padding: 16, color: '#c62828', fontSize: 13 }}>
        Failed to load metering data: {costState.error.message}
      </div>
    );
  }

  const cost = costState.value;

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, color: '#555' }}>
          {namespace}/{deployment}
        </div>
        <WindowPicker selected={windowHours} onChange={setWindowHours} />
      </div>

      {/* KPI row */}
      {costState.loading || !cost ? (
        <div style={{ color: '#888', fontSize: 13, padding: '12px 0' }}>
          Loading metrics…
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <KpiCard
              label="Hourly Cost"
              value={`$${cost.hourlyCost.toFixed(4)}`}
              sub={`over last ${windowHours}h avg`}
            />
            <KpiCard
              label="Daily Cost"
              value={`$${(cost.hourlyCost * 24).toFixed(3)}`}
              sub="projected"
            />
            <KpiCard
              label="Monthly Cost"
              value={`$${(cost.hourlyCost * 24 * 30).toFixed(2)}`}
              sub="projected"
            />
            <KpiCard
              label="Replicas"
              value={String(cost.replicaCount)}
              sub="running"
            />
          </div>

          <SectionTitle>CPU Usage</SectionTitle>
          <CpuChart
            cpuCores={cost.cpuCores}
            cpuRequestCores={cost.cpuRequestCores}
          />

          <SectionTitle>Memory Usage</SectionTitle>
          <MemoryChart
            memGiB={cost.memGiB}
            memRequestGiB={cost.memRequestGiB}
          />

          <SectionTitle>Cost Breakdown</SectionTitle>
          <CostDonut
            cpuCostPerHour={cost.cpuCostPerHour}
            memoryCostPerHour={cost.memoryCostPerHour}
          />
        </>
      )}
    </div>
  );
}
