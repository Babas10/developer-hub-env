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
import { CostHistoryPoint } from '../../api';
import { formatUsd } from '../common/format';

// Data point uses a numeric Unix-ms timestamp as the X key so Recharts
// treats the axis as a continuous time scale rather than a categorical one.
// Without this, monthly rollup points and hourly points get equal pixel width,
// which completely distorts the timeline.
interface ChartPoint {
  ts: number;   // Unix ms
  cost: number;
}

/**
 * Compute monthly tick positions spanning the data range.
 * Returns the first-of-month timestamps (UTC midnight) within [min, max].
 * Falls back to weekly ticks for ranges under 60 days.
 */
function computeTicks(points: ChartPoint[]): number[] {
  if (points.length === 0) return [];
  const min = points[0].ts;
  const max = points[points.length - 1].ts;
  const rangeDays = (max - min) / 86_400_000;

  const ticks: number[] = [];

  if (rangeDays > 60) {
    // One tick per calendar month
    const d = new Date(min);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    while (d.getTime() <= max) {
      ticks.push(d.getTime());
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  } else {
    // One tick per week
    const d = new Date(min);
    d.setUTCHours(0, 0, 0, 0);
    while (d.getTime() <= max) {
      ticks.push(d.getTime());
      d.setUTCDate(d.getUTCDate() + 7);
    }
  }

  return ticks;
}

function formatTick(ts: number, rangeDays: number): string {
  const d = new Date(ts);
  if (rangeDays > 60) {
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTooltipLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
    ts: new Date(p.sampledAt).getTime(),
    cost: p.hourlyCost,
  }));

  const ticks = computeTicks(data);
  const rangeDays = data.length > 1
    ? (data[data.length - 1].ts - data[0].ts) / 86_400_000
    : 1;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          ticks={ticks}
          tickFormatter={(ts: number) => formatTick(ts, rangeDays)}
          tick={{ fontSize: 11 }}
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
        <Tooltip
          formatter={((value: number) =>
            [`${formatUsd(value, 4)}/hr`, 'Hourly cost']) as any}
          labelFormatter={((ts: number) =>
            formatTooltipLabel(ts)) as any}
        />
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
