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
import { Typography } from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import type { TooltipProps } from 'recharts';
import { CostHistoryPoint } from '../../api';
import { formatUsd } from '../common/format';

interface ChartPoint {
  label: string;
  cost: number;
}

function formatAxisDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function TrendTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
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
        <strong>{label}</strong>
      </Typography>
      <Typography variant="caption" display="block">
        {formatUsd(payload[0].value ?? 0, 4)}/hr
      </Typography>
    </div>
  );
}

interface Props {
  historyState: {
    value?: CostHistoryPoint[];
    loading: boolean;
    error?: Error;
  };
}

export function CostTrendChart({ historyState }: Props) {
  if (historyState.loading) {
    return <Progress />;
  }

  if (historyState.error) {
    return (
      <Typography variant="body2" color="error">
        Failed to load cost history.
      </Typography>
    );
  }

  const points = historyState.value ?? [];

  if (points.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No cost history yet — snapshots are written hourly and will appear
        here after the first cycle.
      </Typography>
    );
  }

  const data: ChartPoint[] = points.map(p => ({
    label: formatAxisDate(p.sampledAt),
    cost: p.hourlyCost,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => formatUsd(v, 2)}
          width={64}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<TrendTooltip />} />
        <Line
          type="monotone"
          dataKey="cost"
          name="Hourly cost"
          stroke="#1976d2"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
