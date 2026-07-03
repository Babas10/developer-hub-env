import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CostHistoryPoint } from '../../api';

interface CostTrendChartProps {
  history: CostHistoryPoint[];
}

export function CostTrendChart({ history }: CostTrendChartProps) {
  if (!history.length) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
        No historical data yet. Data is collected hourly.
      </div>
    );
  }

  const data = history.map(point => ({
    date: new Date(point.sampledAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    cost: parseFloat(point.hourlyCost.toFixed(4)),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis
          unit="$"
          width={65}
          tickFormatter={v => `$${v.toFixed(3)}`}
        />
        <Tooltip formatter={(val: number) => [`$${val.toFixed(4)}/hr`, 'Hourly Cost']} />
        <Line
          type="monotone"
          dataKey="cost"
          name="Hourly Cost"
          stroke="#9c27b0"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
