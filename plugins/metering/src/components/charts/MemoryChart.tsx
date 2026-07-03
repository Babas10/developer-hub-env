import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface MemoryChartProps {
  memGiB: number;
  memRequestGiB: number;
}

export function MemoryChart({ memGiB, memRequestGiB }: MemoryChartProps) {
  const data = [
    {
      time: 'Now',
      usage: parseFloat(memGiB.toFixed(3)),
      request: parseFloat(memRequestGiB.toFixed(3)),
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis unit=" GiB" width={70} />
        <Tooltip formatter={(val: number) => [`${val} GiB`]} />
        <Legend />
        <Area
          type="monotone"
          dataKey="usage"
          name="Usage"
          stroke="#4caf50"
          fill="#4caf5033"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="request"
          name="Request"
          stroke="#ff9800"
          fill="#ff980022"
          strokeDasharray="5 5"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
