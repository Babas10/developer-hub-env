import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface CostDonutProps {
  cpuCostPerHour: number;
  memoryCostPerHour: number;
}

const COLORS = ['#2196f3', '#4caf50'];

export function CostDonut({ cpuCostPerHour, memoryCostPerHour }: CostDonutProps) {
  const data = [
    { name: 'CPU', value: parseFloat(cpuCostPerHour.toFixed(4)) },
    { name: 'Memory', value: parseFloat(memoryCostPerHour.toFixed(4)) },
  ];

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={75}
          paddingAngle={4}
          dataKey="value"
          label={({ name, percent }) =>
            `${name} ${(percent * 100).toFixed(0)}%`
          }
        >
          {data.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(val: number) => [`$${val.toFixed(4)}/hr`]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
