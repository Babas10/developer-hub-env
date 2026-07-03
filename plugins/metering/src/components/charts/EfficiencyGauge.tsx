import React from 'react';

interface EfficiencyGaugeProps {
  cpuCores: number;
  cpuRequestCores: number;
  memGiB: number;
  memRequestGiB: number;
}

interface BarProps {
  label: string;
  used: number;
  requested: number;
  unit: string;
  color: string;
}

function EfficiencyBar({ label, used, requested, unit, color }: BarProps) {
  const pct = requested > 0 ? Math.min((used / requested) * 100, 100) : 0;
  const overProvisioned = requested > 0 && used / requested < 0.5;

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        <span>{label}</span>
        <span style={{ color: overProvisioned ? '#ff9800' : 'inherit' }}>
          {used.toFixed(3)} / {requested.toFixed(3)} {unit}
          {overProvisioned && '  ⚠ over-provisioned'}
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: '#e0e0e0',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: overProvisioned ? '#ff9800' : color,
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

export function EfficiencyGauge({
  cpuCores,
  cpuRequestCores,
  memGiB,
  memRequestGiB,
}: EfficiencyGaugeProps) {
  return (
    <div style={{ padding: '8px 0' }}>
      <EfficiencyBar
        label="CPU Efficiency"
        used={cpuCores}
        requested={cpuRequestCores}
        unit="cores"
        color="#2196f3"
      />
      <EfficiencyBar
        label="Memory Efficiency"
        used={memGiB}
        requested={memRequestGiB}
        unit="GiB"
        color="#4caf50"
      />
    </div>
  );
}
