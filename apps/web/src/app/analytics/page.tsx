"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { api } from "@/lib/api";
import {
  Card,
  CardHeader,
  PageHeader,
  Stat,
  SkeletonCard,
  ErrorState,
  EmptyState,
  LinkButton,
  Button,
} from "@/components/ui";

const AXIS = { stroke: "#a8a29e", fontSize: 11 } as const;
const TOOLTIP_STYLE = {
  background: "#fff",
  border: "1px solid #e7e5e4",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 2px 8px -2px rgb(28 25 23 / 0.10)",
} as const;

export default function Analytics() {
  const [exporting, setExporting] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["profile-analytics"],
    queryFn: () => api.getProfileAnalytics(),
  });

  const a = data?.data;
  const hasData = (a?.totals.connections ?? 0) > 0;

  const runExport = async (kind: "json" | "connections" | "companies") => {
    setExporting(kind);
    try {
      if (kind === "json") await api.exportAnalytics();
      else if (kind === "connections") await api.exportConnections();
      else await api.exportCompanies();
    } finally {
      setExporting(null);
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
        </div>
        <SkeletonCard className="mt-6 h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Every number comes from your imported data"
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={exporting === "json"}
              onClick={() => runExport("json")}
              disabled={!hasData}
            >
              Download report (JSON)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={exporting === "connections"}
              onClick={() => runExport("connections")}
              disabled={!hasData}
            >
              Connections CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={exporting === "companies"}
              onClick={() => runExport("companies")}
              disabled={!hasData}
            >
              Companies CSV
            </Button>
          </>
        }
      />

      {!hasData ? (
        <Card>
          <EmptyState
            title="Not enough data yet"
            description="Import your LinkedIn archive to see network composition, growth and message activity here."
            action={<LinkButton href="/imports" variant="primary">Import your LinkedIn data</LinkButton>}
          />
        </Card>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Connections" value={a.totals.connections} />
            <Stat label="Companies" value={a.totals.companies} />
            <Stat label="Messages" value={a.totals.messages} />
            <Stat label="Schools" value={a.totals.schools} />
          </div>

          {/* Growth */}
          <Card className="mt-6">
            <CardHeader
              title="Network growth"
              description="New connections per month, from Connected On dates"
            />
            <div className="card-pad">
              {a.growth.length === 0 ? (
                <EmptyState
                  title="No connection dates"
                  description="Your import didn't include Connected On dates, so growth can't be charted."
                />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={a.growth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0efee" vertical={false} />
                      <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e7e5e4" }} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="New connections"
                        stroke="#0f766e"
                        strokeWidth={2}
                        fill="#0f766e"
                        fillOpacity={0.08}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Message activity */}
            <Card>
              <CardHeader title="Message activity" description="Inbound vs outbound per month" />
              <div className="card-pad">
                {a.messageActivity.byMonth.length === 0 ? (
                  <EmptyState
                    title="No message timestamps"
                    description={
                      a.messageActivity.total === 0
                        ? "No messages were part of your import."
                        : "Messages exist but have no usable dates."
                    }
                  />
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={a.messageActivity.byMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0efee" vertical={false} />
                        <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e7e5e4" }} />
                        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="outbound" name="Sent" stackId="m" fill="#0f766e" radius={[0, 0, 2, 2]} />
                        <Bar dataKey="inbound" name="Received" stackId="m" fill="#99f6e4" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </Card>

            {/* Industries */}
            <Card>
              <CardHeader title="Top industries" description="From company records" />
              <div className="card-pad">
                {a.networkComposition.industries.length === 0 ? (
                  <EmptyState
                    title="No industry data"
                    description="Your companies import didn't include industry fields."
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {a.networkComposition.industries.slice(0, 8).map((ind: any) => {
                      const max = a.networkComposition.industries[0].count;
                      return (
                        <li key={ind.name} className="flex items-center gap-3">
                          <span className="w-40 flex-shrink-0 truncate text-secondary text-ink-2" title={ind.name}>
                            {ind.name}
                          </span>
                          <div className="h-2 flex-1 rounded-full bg-raised">
                            <div
                              className="h-2 rounded-full bg-accent/70"
                              style={{ width: `${Math.max(4, (ind.count / max) * 100)}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-caption text-ink-3">{ind.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>

            {/* Locations */}
            <Card>
              <CardHeader title="Locations" description="Where your network is" />
              <div className="card-pad">
                {a.networkComposition.locations.length === 0 ? (
                  <EmptyState
                    title="No location data"
                    description="Your connections didn't include locations."
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {a.networkComposition.locations.slice(0, 8).map((loc: any) => {
                      const max = a.networkComposition.locations[0].count;
                      return (
                        <li key={loc.name} className="flex items-center gap-3">
                          <span className="w-40 flex-shrink-0 truncate text-secondary text-ink-2" title={loc.name}>
                            {loc.name}
                          </span>
                          <div className="h-2 flex-1 rounded-full bg-raised">
                            <div
                              className="h-2 rounded-full bg-accent/70"
                              style={{ width: `${Math.max(4, (loc.count / max) * 100)}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-caption text-ink-3">{loc.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>

            {/* Schools */}
            <Card>
              <CardHeader title="Education" description="Schools across your network and history" />
              <div className="card-pad">
                {a.schools.length === 0 ? (
                  <EmptyState
                    title="No education data"
                    description="No school records were part of your import."
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {a.schools.slice(0, 8).map((s: any) => (
                      <li key={s.name} className="flex items-center justify-between border-b border-line/70 pb-2 last:border-0 last:pb-0">
                        <span className="truncate text-secondary text-ink-2">{s.name}</span>
                        <span className="text-caption text-ink-3">{s.people}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
