import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  time: string;
  usage: number;
  request: number;
}

interface CpuChartProps {
  cpuCores: number;
  cpuRequestCores: number;
}

/**
 * Shows current CPU usage vs request as a simple comparison.
 * In a full implementation these would be time-series data points from Prometheus range queries.
 */
export function CpuChart({ cpuCores, cpuRequestCores }: CpuChartProps) {
  const data: DataPoint[] = [
    { time: 'Now', usage: parseFloat(cpuCores.toFixed(4)), request: parseFloat(cpuRequestCores.toFixed(4)) },
  ];

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis unit=" cores" width={70} />
        <Tooltip formatter={(val: number) => [`${val} cores`]} />
        <Legend />
        <Line
          type="monotone"
          dataKey="usage"
          name="Usage"
          stroke="#2196f3"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="request"
          name="Request"
          stroke="#ff9800"
          strokeDasharray="5 5"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
