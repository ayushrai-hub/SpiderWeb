"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth, formatNumber } from "@/lib/format";

const AXIS = { stroke: "#a8a29e", fontSize: 11 } as const;
const TOOLTIP = {
  background: "#fff",
  border: "1px solid #e7e5e4",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 2px 8px -2px rgb(28 25 23 / 0.10)",
} as const;

export interface GrowthPoint {
  month: string;
  added: number;
  cumulative: number;
}

/**
 * Monthly additions with the running total.
 *
 * Long histories are bucketed so the axis stays readable: a 12-year export
 * would otherwise render 140 unlabelled ticks.
 */
export function GrowthChart({ data }: { data: GrowthPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-16 text-center text-secondary text-ink-3">
        Your export has no connection dates, so growth over time cannot be shown.
      </p>
    );
  }

  const series = data.map((d) => ({ ...d, label: formatMonth(d.month) }));
  const tickInterval = Math.max(0, Math.ceil(series.length / 8) - 1);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        {/* ComposedChart, not AreaChart: an <Line> inside an AreaChart renders
            but does not contribute to the y-axis domain, so the cumulative
            series was being drawn off-scale. */}
        <ComposedChart data={series} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0efee" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: "#e7e5e4" }}
            interval={tickInterval}
            minTickGap={8}
            padding={{ right: 12 }}
          />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
          <Tooltip
            contentStyle={TOOLTIP}
            formatter={(value: number, name: string) => [formatNumber(value), name]}
            labelFormatter={(label) => String(label)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
          <Area
            type="monotone"
            dataKey="added"
            name="New connections"
            stroke="#0f766e"
            strokeWidth={2}
            fill="#0f766e"
            fillOpacity={0.08}
          />
          <Line
            type="monotone"
            dataKey="cumulative"
            name="Total connections"
            stroke="#a8a29e"
            strokeWidth={1.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
