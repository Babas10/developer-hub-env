import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Typography } from '@material-ui/core';
import { CostResult } from '../../api';
import { formatUsd } from '../common/format';

interface Slice {
  name: string;
  value: number;
  color: string;
}

// Colours chosen to be distinct and readable against a white background,
// consistent with the Material UI palette used in the rest of the plugin.
const SLICE_DEFS = [
  { name: 'CPU',    getVal: (c: CostResult) => c.cpuCostPerHour,    color: '#1976d2' },
  { name: 'Memory', getVal: (c: CostResult) => c.memoryCostPerHour, color: '#388e3c' },
  { name: 'GPU',    getVal: (c: CostResult) => c.gpuCostPerHour,    color: '#f57c00' },
];

interface DonutTooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 4,
        padding: '6px 10px',
      }}
    >
      <Typography variant="caption">
        <strong>{name}</strong>: {formatUsd(value ?? 0)}/hr
      </Typography>
    </div>
  );
}

interface Props {
  cost: CostResult;
}

export function CostDonut({ cost }: Props) {
  const slices: Slice[] = SLICE_DEFS.map(d => ({
    name: d.name,
    value: d.getVal(cost),
    color: d.color,
  })).filter(s => s.value > 0);

  if (slices.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No cost breakdown available.
      </Typography>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={slices}
          cx="50%"
          cy="50%"
          innerRadius={54}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
          nameKey="name"
        >
          {slices.map(slice => (
            <Cell key={slice.name} fill={slice.color} />
          ))}
        </Pie>
        <Tooltip content={<DonutTooltip />} />
        <Legend
          iconType="circle"
          iconSize={10}
          formatter={(value: string) => (
            <span style={{ fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
