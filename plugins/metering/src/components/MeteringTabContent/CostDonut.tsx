import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CostResult } from '../../api';
import { formatUsd } from '../common/format';
import { Typography } from '@material-ui/core';

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
        <Tooltip
          formatter={((value: number, name: string) =>
            [`${formatUsd(value)}/hr`, name]) as any}
        />
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
