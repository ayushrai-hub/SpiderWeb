"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatNumber, percent, relativeTime } from "@/lib/format";
import {
  Alert,
  BarList,
  Card,
  CardHeader,
  ErrorState,
  LinkButton,
  PageHeader,
  SkeletonCard,
  Stat,
} from "@/components/ui";
import { GetStarted } from "@/components/onboarding/GetStarted";
import { GrowthChart } from "@/components/charts/GrowthChart";

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard(),
  });

  const dashboard = data?.data;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Loading your network…" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
        <SkeletonCard className="mt-6 h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!dashboard?.hasData) {
    return (
      <div>
        <PageHeader title="Welcome to SpiderWeb" subtitle="Import your LinkedIn data to get started" />
        <GetStarted />
      </div>
    );
  }

  const { totals, signals, dataQuality } = dashboard;
  const signalBy = Object.fromEntries(signals.map((s) => [s.key, s]));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          dashboard.self
            ? `${dashboard.self.name}${dashboard.self.headline ? ` · ${dashboard.self.headline}` : ""}`
            : "Your relationship intelligence overview"
        }
        actions={
          <>
            <LinkButton href="/people" variant="secondary" size="sm">
              Browse people
            </LinkButton>
            <LinkButton href="/imports" variant="primary" size="sm">
              Import more data
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Connections" value={formatNumber(totals.connections)} href="/people" />
        <Stat
          label="Companies"
          value={formatNumber(totals.companies)}
          hint={`${formatNumber(totals.currentCompanies)} with someone currently there`}
          href="/companies"
        />
        <Stat
          label="Conversations"
          value={formatNumber(totals.conversations)}
          hint={
            totals.messages > 0 ? `${formatNumber(totals.messages)} messages` : "No messages in your export"
          }
          href="/conversations"
        />
        <Stat
          label="Last import"
          value={dashboard.lastImportAt ? relativeTime(dashboard.lastImportAt) : "—"}
          hint={`${formatNumber(totals.imports)} completed`}
          href="/imports"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Network growth"
            description="New connections per month from Connected On. Cumulative counts dated rows only — missing dates are not treated as zero growth."
          />
          <div className="card-pad">
            <GrowthChart data={dashboard.growth} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Relationship signals" description="Rules applied to your imported data" />
          <ul className="divide-y divide-line/70">
            {signals
              .filter((s) => s.count > 0)
              .map((signal) => (
                <li key={signal.key}>
                  <Link
                    href={`/people?signals=${signal.key}`}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-raised/50 focus-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body text-ink">{signal.label}</span>
                      <span className="block truncate text-caption text-ink-3">{signal.rule}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-body font-medium text-ink">
                      {signal.count}
                    </span>
                  </Link>
                </li>
              ))}
            {signals.every((s) => s.count === 0) && (
              <li className="px-5 py-8 text-center text-secondary text-ink-3">
                No signals yet — import an export that includes connection dates.
              </li>
            )}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Where your network works"
            description="Companies with the most people from your network"
            action={
              <Link
                href="/companies"
                className="text-secondary text-accent hover:underline focus-ring rounded"
              >
                All companies
              </Link>
            }
          />
          <BarList
            emptyMessage="No company data in your import."
            items={dashboard.topCompanies.map((c) => ({
              label: c.name,
              value: c.total,
              href: `/companies/${c.id}`,
            }))}
          />
        </Card>

        <Card>
          <CardHeader title="Most common roles" description="Current job titles across your connections" />
          <BarList
            emptyMessage="No job titles in your import."
            items={dashboard.topTitles.map((t) => ({
              label: t.value,
              value: t.count,
              href: `/people?title=${encodeURIComponent(t.value)}`,
            }))}
          />
        </Card>
      </div>

      {(dashboard.careerMoves.length > 0 || signalBy.changed_company?.count) && (
        <Card className="mt-6">
          <CardHeader
            title="Career moves"
            description="People whose employer changed between two of your imports"
            action={
              <Link
                href="/analytics"
                className="text-secondary text-accent hover:underline focus-ring rounded"
              >
                {formatNumber(dashboard.careerMoveCount ?? dashboard.careerMoves.length)} on record
              </Link>
            }
          />
          {dashboard.careerMoves.length === 0 ? (
            <p className="px-5 py-8 text-center text-secondary text-ink-3">
              No moves observed yet. Import a newer export to spot them.
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {dashboard.careerMoves.map((move) => (
                <li key={move.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <Link
                    href={`/people/${move.id}`}
                    className="text-body font-medium text-ink hover:text-accent focus-ring rounded"
                  >
                    {move.name}
                  </Link>
                  <span className="text-secondary text-ink-2">
                    {move.from} <span className="text-ink-3">→</span>{" "}
                    <span className="text-ink">{move.to}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recently connected" />
          {dashboard.recentConnections.length === 0 ? (
            <p className="px-5 py-8 text-center text-secondary text-ink-3">
              No connection dates in your import.
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {dashboard.recentConnections.map((person) => (
                <li key={person.id}>
                  <Link
                    href={`/people/${person.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-raised/50 focus-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body text-ink">{person.name}</span>
                      <span className="block truncate text-caption text-ink-3">
                        {[person.currentTitle, person.currentCompany].filter(Boolean).join(" at ") ||
                          "No role recorded"}
                      </span>
                    </span>
                    <span className="shrink-0 text-caption text-ink-3">{formatDate(person.connectedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="What your export contains"
            description="Coverage of the fields SpiderWeb can use"
          />
          <div className="card-pad space-y-3">
            {[
              { label: "Company", value: dataQuality.withCompany },
              { label: "Job title", value: dataQuality.withTitle },
              { label: "Connection date", value: dataQuality.withConnectionDate },
              { label: "Email address", value: dataQuality.withEmail },
              { label: "Location", value: dataQuality.withLocation },
            ].map((row) => {
              const pct = percent(row.value, dataQuality.total);
              return (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between text-secondary">
                    <span className="text-ink-2">{row.label}</span>
                    <span className="tabular-nums text-ink-3">
                      {formatNumber(row.value)} of {formatNumber(dataQuality.total)} ({pct}%)
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {dataQuality.withLocation === 0 && (
              <Alert variant="info" className="mt-4">
                LinkedIn&apos;s Connections.csv does not include a location column, so location is only known
                for you.
              </Alert>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
