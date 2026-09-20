"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import type { AnalyticsReport, Distribution, InsightCard } from "@/lib/types";
import {
  Alert,
  BarList,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  SkeletonCard,
  Stat,
} from "@/components/ui";
import { GrowthChart } from "@/components/charts/GrowthChart";

type Tab = "overview" | "composition" | "career" | "relationships" | "opportunities" | "changes" | "quality";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "composition", label: "Network" },
  { id: "career", label: "Career" },
  { id: "relationships", label: "Relationships" },
  { id: "opportunities", label: "Opportunities" },
  { id: "changes", label: "Changes" },
  { id: "quality", label: "Data quality" },
];

function peopleHref(metric: string, value?: string): string {
  if (!value) {
    if (metric === "recent") return "/people?signals=recent";
    if (metric === "changed_company") return "/people?signals=changed_company";
    return "/people";
  }
  const enc = encodeURIComponent(value);
  switch (metric) {
    case "company":
      return `/people?company=${enc}`;
    case "former_company":
      return `/people?pastCompany=${enc}`;
    case "title":
      return `/people?title=${enc}`;
    case "location":
    case "city":
    case "country":
      return `/people?location=${enc}`;
    case "school":
      return `/people?school=${enc}`;
    case "industry":
      return `/people?industry=${enc}`;
    default:
      return `/people`;
  }
}

function Coverage({
  known,
  unknown,
  total,
  coveragePercent,
}: AnalyticsReport["quality"]["fields"][number]["coverage"]) {
  return (
    <p className="text-caption text-ink-3">
      {formatNumber(known)} classified · {formatNumber(unknown)} unknown · {coveragePercent}% coverage of{" "}
      {formatNumber(total)}
    </p>
  );
}

function DistCard({
  title,
  description,
  dist,
  hrefMetric,
}: {
  title: string;
  description: string;
  dist: Distribution;
  hrefMetric?: string;
}) {
  const metric = hrefMetric ?? dist.dimension;
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="px-5 pt-3">
        <Coverage {...dist.coverage} />
      </div>
      <BarList
        emptyMessage={dist.unknownLabel}
        items={dist.bins.slice(0, 12).map((b) => ({
          label: `${b.label} · ${b.shareOfNetwork.percent}%`,
          value: b.count,
          href: peopleHref(metric, b.provenance.trust === "inferred" ? undefined : b.label),
        }))}
      />
      {dist.bins[0]?.provenance.trust === "inferred" && (
        <p className="px-5 pb-4 text-caption text-ink-3">
          Classification is inferred, not an observed LinkedIn field. Click through lists the observed records
          only when the export contained that field.
        </p>
      )}
    </Card>
  );
}

function InsightBlock({ insight, onOpen }: { insight: InsightCard; onOpen: (insight: InsightCard) => void }) {
  return (
    <li className="border-b border-line/70 px-5 py-4 last:border-0">
      <button type="button" onClick={() => onOpen(insight)} className="w-full text-left focus-ring rounded">
        <p className="text-body font-medium text-ink">{insight.title}</p>
        <p className="mt-1 text-secondary text-ink-2">{insight.description}</p>
        <p className="mt-2 text-caption text-ink-3">
          {insight.trust} · {insight.confidence} confidence · {insight.calculation.expression}
        </p>
      </button>
    </li>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [insight, setInsight] = useState<InsightCard | null>(null);
  const [target, setTarget] = useState({
    company: "",
    role: "",
    industry: "",
    location: "",
    recentlyMoved: false,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api.analytics(),
  });
  const report = data?.data;

  const askQuery = useQuery({
    queryKey: ["analytics-ask", asked],
    queryFn: () => api.ask(asked),
    enabled: asked.length > 0,
  });

  const oppQuery = useQuery({
    queryKey: ["targeted-opportunities", target],
    queryFn: () =>
      api.targetedOpportunities({
        company: target.company || undefined,
        role: target.role || undefined,
        industry: target.industry || undefined,
        location: target.location || undefined,
        recentlyMoved: target.recentlyMoved || undefined,
        limit: 25,
      }),
    enabled: tab === "opportunities",
  });

  const recordsQuery = useQuery({
    queryKey: ["analytics-records", insight?.drilldown],
    queryFn: () => api.analyticsRecords(insight!.drilldown.metric, insight!.drilldown.value),
    enabled: Boolean(insight),
  });

  const diversity = report?.diversity;

  const empty = useMemo(() => !report?.hasData, [report]);

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <SkeletonCard className="h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
      </div>
    );
  }

  if (empty || !report) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <Card>
          <EmptyState
            title="No data to analyse yet"
            description="Every figure is computed from imported records. Import a LinkedIn export to fill this in."
            action={
              <LinkButton href="/imports" variant="primary">
                Import your data
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Network analytics"
        subtitle="Deterministic counts from your import. Inferences are labelled. Missing data is coverage, not zero."
        actions={
          <a
            href={api.exportUrl("analytics.json")}
            className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-secondary font-medium text-ink hover:bg-raised focus-ring"
          >
            Export report
          </a>
        }
      />

      <Card className="mb-6">
        <form
          className="card-pad flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setAsked(question.trim());
          }}
        >
          <input
            className="input flex-1"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask your network: Who works at OpenAI? What changed since my last import?"
            aria-label="Ask a question about your network"
          />
          <Button type="submit" size="sm">
            Ask
          </Button>
        </form>
        {askQuery.data && (
          <div className="border-t border-line px-5 py-4">
            <p className="text-body text-ink">{askQuery.data.data.answer}</p>
            {askQuery.data.data.limitations.length > 0 && (
              <p className="mt-2 text-caption text-ink-3">{askQuery.data.data.limitations.join(" ")}</p>
            )}
            {askQuery.data.data.records.length > 0 && (
              <ul className="mt-3 divide-y divide-line/70">
                {askQuery.data.data.records.slice(0, 12).map((row, i) => (
                  <li key={`${row.personId ?? row.name}-${i}`} className="py-2">
                    {row.personId ? (
                      <Link href={`/people/${row.personId}`} className="text-body text-ink hover:text-accent">
                        {row.name}
                      </Link>
                    ) : (
                      <span className="text-body text-ink">{row.name}</span>
                    )}
                    {row.detail && <span className="ml-2 text-caption text-ink-3">{row.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3 py-1 text-caption focus-ring ${
              tab === t.id
                ? "border-accent bg-accent text-white"
                : "border-line-strong text-ink-2 hover:bg-raised"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat
              label="Connections"
              value={formatNumber(report.networkSize)}
              href="/people"
              hint="Excludes your own profile"
            />
            <Stat
              label="Company diversity"
              value={diversity?.companies ?? "—"}
              hint={report.concentration.companies.explanation}
              href="/analytics"
            />
            <Stat
              label="Career transitions"
              value={formatNumber(report.career.peopleWithMultipleEmployers)}
              hint={`${formatNumber(report.career.moves.length)} company-to-company rows`}
            />
            <Stat
              label="Dated connections"
              value={`${report.growth.coverage.coveragePercent}%`}
              hint={`${formatNumber(report.growth.coverage.known)} of ${formatNumber(report.networkSize)} have Connected On`}
            />
          </div>

          <Alert variant="info" className="mt-6">
            {report.graphCaveat}
          </Alert>

          <Card className="mt-6">
            <CardHeader
              title="Network growth"
              description={
                report.growth.earliestDate
                  ? `Earliest Connected On in this file: ${formatDate(report.growth.earliestDate)}. Cumulative is dated connections only.`
                  : "No connection dates in the export."
              }
            />
            <div className="card-pad">
              <GrowthChart data={report.growth.series} />
              <p className="mt-3 text-caption text-ink-3">
                Last 90 days: {formatNumber(report.growth.last90Days)} added · previous 90 days:{" "}
                {formatNumber(report.growth.previous90Days)} · {report.growth.acceleration}
              </p>
            </div>
          </Card>

          <Card className="mt-6">
            <CardHeader
              title="Evidence-backed findings"
              description="Each card is a calculation you can inspect"
            />
            <ul>
              {report.insights.map((item) => (
                <InsightBlock key={item.id} insight={item} onOpen={setInsight} />
              ))}
              {report.insights.length === 0 && (
                <li className="px-5 py-8 text-center text-secondary text-ink-3">
                  No findings yet — usually because the export is small or sparse.
                </li>
              )}
            </ul>
          </Card>
        </>
      )}

      {tab === "composition" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <DistCard
            title="Current companies"
            description="Where people work now, grouped by normalised company key"
            dist={report.composition.currentCompanies}
            hrefMetric="company"
          />
          <DistCard
            title="Former companies"
            description="Non-current employment rows"
            dist={report.composition.formerCompanies}
            hrefMetric="former_company"
          />
          <DistCard
            title="Job titles"
            description="Current titles as exported"
            dist={report.composition.titles}
          />
          <DistCard
            title="Role families"
            description="Inferred from title keywords"
            dist={report.composition.roleFamilies}
          />
          <DistCard
            title="Seniority markers"
            description="Only when the title contains an explicit marker"
            dist={report.composition.seniority}
          />
          <DistCard
            title="Classified industries"
            description="Observed LinkedIn industry when present; otherwise inferred"
            dist={report.composition.industries}
          />
          <DistCard
            title="Locations"
            description="Raw location strings"
            dist={report.composition.locations}
          />
          <DistCard
            title="Schools"
            description="Education rows in the export"
            dist={report.composition.schools}
          />
          <Card className="lg:col-span-2">
            <CardHeader title="Concentration and diversity" />
            <div className="card-pad grid gap-4 md:grid-cols-2">
              {(
                [
                  ["Companies", report.concentration.companies, report.diversity.companies],
                  ["Industries", report.concentration.industries, report.diversity.industries],
                  ["Geography", report.concentration.countries, report.diversity.geography],
                  ["Role families", report.concentration.roleFamilies, report.diversity.roles],
                ] as const
              ).map(([label, conc, band]) => (
                <div key={label}>
                  <p className="text-label uppercase text-ink-3">{label}</p>
                  <p className="text-h3 capitalize text-ink">{band} diversity</p>
                  <p className="mt-1 text-secondary text-ink-2">{conc.explanation}</p>
                  <p className="mt-1 text-caption text-ink-3">
                    HHI {conc.hhi.toFixed(3)} · top {conc.topN} share {conc.topShare.percent}% of classified ·
                    coverage {conc.coverage.coveragePercent}%
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "career" && (
        <>
          <Alert variant="info">{report.career.limitations[0]}</Alert>
          <Card className="mt-6">
            <CardHeader
              title="Company movement"
              description={`${formatNumber(report.career.flows.length)} observed employer-to-employer paths`}
            />
            {report.career.flows.length === 0 ? (
              <p className="px-5 py-8 text-center text-secondary text-ink-3">
                No multi-employer histories yet. Import a newer export to detect employer changes.
              </p>
            ) : (
              <ul className="divide-y divide-line/70">
                {report.career.flows.slice(0, 25).map((flow) => (
                  <li
                    key={`${flow.fromKey}-${flow.toKey}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                  >
                    <span className="text-body text-ink">
                      {flow.fromLabel} <span className="text-ink-3">→</span> {flow.toLabel}
                    </span>
                    <Link
                      href={`/people?pastCompany=${encodeURIComponent(flow.fromLabel)}`}
                      className="text-secondary text-accent hover:underline"
                    >
                      {flow.count} {flow.count === 1 ? "person" : "people"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="mt-6">
            <CardHeader title="People behind those transitions" />
            <ul className="divide-y divide-line/70">
              {report.career.moves.slice(0, 40).map((move) => (
                <li
                  key={`${move.personId}-${move.fromCompany}-${move.toCompany}-${move.observedAt}`}
                  className="flex flex-wrap justify-between gap-2 px-5 py-3"
                >
                  <Link
                    href={`/people/${move.personId}`}
                    className="text-body font-medium text-ink hover:text-accent"
                  >
                    {move.name}
                  </Link>
                  <span className="text-secondary text-ink-2">
                    {move.fromCompany} → {move.toCompany}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {tab === "relationships" && (
        <>
          <Alert variant="warning">{report.recency.caveat}</Alert>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Connection age" description={report.recency.method} />
              <div className="px-5 pt-3">
                <Coverage {...report.recency.coverage} />
              </div>
              <BarList
                emptyMessage="No connection dates."
                items={report.recency.buckets.map((b) => ({
                  label: `${b.label} · ${b.shareOfKnown.percent}% of dated`,
                  value: b.count,
                }))}
              />
            </Card>
            <Card>
              <CardHeader
                title="Older connections with shared context"
                description="Not “dormant relationships”. These people have age plus no recent recorded contact."
              />
              <ul className="divide-y divide-line/70">
                {report.reconnectionCandidates.map((row) => (
                  <li key={row.personId} className="px-5 py-3">
                    <Link
                      href={`/people/${row.personId}`}
                      className="text-body font-medium text-ink hover:text-accent"
                    >
                      {row.name}
                    </Link>
                    <p className="text-caption text-ink-3">
                      {[row.currentTitle, row.currentCompany].filter(Boolean).join(" at ") ||
                        "No role recorded"}
                    </p>
                    <p className="mt-1 text-caption text-ink-2">{row.reasons.join(" · ")}</p>
                  </li>
                ))}
                {report.reconnectionCandidates.length === 0 && (
                  <li className="px-5 py-8 text-center text-secondary text-ink-3">
                    No older-and-quiet connections matched the rule.
                  </li>
                )}
              </ul>
            </Card>
          </div>
        </>
      )}

      {tab === "opportunities" && (
        <Card>
          <CardHeader
            title="Query your network"
            description="Filters run against imported records. Nothing here is a recommendation to reach out."
          />
          <div className="card-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label">Target company</span>
              <input
                className="input"
                value={target.company}
                onChange={(e) => setTarget({ ...target, company: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">Title contains</span>
              <input
                className="input"
                value={target.role}
                onChange={(e) => setTarget({ ...target, role: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">Classified industry</span>
              <input
                className="input"
                placeholder="ai, fintech, healthcare…"
                value={target.industry}
                onChange={(e) => setTarget({ ...target, industry: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">Location contains</span>
              <input
                className="input"
                value={target.location}
                onChange={(e) => setTarget({ ...target, location: e.target.value })}
              />
            </label>
          </div>
          <div className="px-5 pb-4">
            <label className="flex items-center gap-2 text-secondary text-ink-2">
              <input
                type="checkbox"
                checked={target.recentlyMoved}
                onChange={(e) => setTarget({ ...target, recentlyMoved: e.target.checked })}
              />
              More than one employer on record
            </label>
          </div>
          <ul className="divide-y divide-line/70 border-t border-line">
            {(oppQuery.data?.data ?? []).map((row) => (
              <li key={row.personId} className="px-5 py-3">
                <Link
                  href={`/people/${row.personId}`}
                  className="text-body font-medium text-ink hover:text-accent"
                >
                  {row.name}
                </Link>
                <p className="text-caption text-ink-3">
                  {[row.currentTitle, row.currentCompany].filter(Boolean).join(" at ") || "No role recorded"}
                </p>
                <p className="mt-1 text-caption text-ink-2">{row.reasons.join(" · ")}</p>
              </li>
            ))}
            {oppQuery.data?.data.length === 0 && (
              <li className="px-5 py-8 text-center text-secondary text-ink-3">
                No matches. Broaden a filter or leave fields empty and tick a signal.
              </li>
            )}
          </ul>
        </Card>
      )}

      {tab === "changes" && (
        <>
          <Alert variant="info">{report.changes.method}</Alert>
          {report.changes.limitations.map((line) => (
            <Alert key={line} variant="warning" className="mt-3">
              {line}
            </Alert>
          ))}
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat
              label="First seen in latest connections import"
              value={formatNumber(report.changes.newConnections.length)}
            />
            <Stat
              label="Not in latest connections import"
              value={formatNumber(report.changes.notSeenInLatestConnectionsImport.length)}
            />
            <Stat label="Company transitions" value={formatNumber(report.changes.companyChanges.length)} />
            <Stat
              label="Title changes on those transitions"
              value={formatNumber(report.changes.titleChanges.length)}
            />
          </div>
          <Card className="mt-6">
            <CardHeader title="New in the latest Connections.csv" />
            <ul className="divide-y divide-line/70">
              {report.changes.newConnections.slice(0, 40).map((p) => (
                <li key={p.personId} className="px-5 py-2.5">
                  <Link href={`/people/${p.personId}`} className="text-body text-ink hover:text-accent">
                    {p.name}
                  </Link>
                </li>
              ))}
              {report.changes.newConnections.length === 0 && (
                <li className="px-5 py-8 text-center text-secondary text-ink-3">
                  {report.changes.comparedImports.previous
                    ? "No new connection rows in the latest import."
                    : "Need a second Connections.csv import to compare."}
                </li>
              )}
            </ul>
          </Card>
        </>
      )}

      {tab === "quality" && (
        <Card>
          <CardHeader title="Field coverage" description={report.quality.method} />
          <div className="card-pad space-y-3">
            {report.quality.fields.map((row) => (
              <div key={row.field}>
                <div className="flex items-baseline justify-between text-secondary">
                  <span className="text-ink-2">{row.field}</span>
                  <span className="tabular-nums text-ink-3">
                    {formatNumber(row.coverage.known)} of {formatNumber(row.coverage.total)} (
                    {row.coverage.coveragePercent}%)
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${row.coverage.coveragePercent}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="text-caption text-ink-3">
              People with more than one employment row:{" "}
              {formatNumber(report.quality.peopleWithEmploymentHistory)}. Education rows:{" "}
              {formatNumber(report.quality.peopleWithEducation)}.
            </p>
          </div>
        </Card>
      )}

      {insight && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Dismiss insight"
            onClick={() => setInsight(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="insight-title"
            className="card relative z-10 max-h-[80vh] w-full max-w-lg overflow-y-auto"
          >
            <div className="card-pad">
              <div className="flex items-start justify-between gap-3">
                <p id="insight-title" className="text-h3 text-ink">
                  {insight.title}
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={() => setInsight(null)}>
                  Close
                </Button>
              </div>
              <p className="mt-2 text-secondary text-ink-2">{insight.description}</p>
              <dl className="mt-4 space-y-2 text-secondary">
                <div>
                  <dt className="text-label uppercase text-ink-3">Why this is notable</dt>
                  <dd>{insight.whyInteresting}</dd>
                </div>
                <div>
                  <dt className="text-label uppercase text-ink-3">Evidence</dt>
                  <dd>{insight.evidence}</dd>
                </div>
                <div>
                  <dt className="text-label uppercase text-ink-3">Calculation</dt>
                  <dd className="font-mono text-caption">
                    {insight.calculation.expression}
                    {insight.calculation.percent !== undefined ? ` = ${insight.calculation.percent}%` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-label uppercase text-ink-3">Trust</dt>
                  <dd>
                    {insight.trust} · {insight.confidence} confidence
                  </dd>
                </div>
              </dl>
              {insight.assumptions.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-caption text-ink-3">
                  {insight.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <LinkButton href={peopleHref(insight.drilldown.metric, insight.drilldown.value)} size="sm">
                  View related people
                </LinkButton>
              </div>
              {recordsQuery.data && recordsQuery.data.data.length > 0 && (
                <ul className="mt-4 divide-y divide-line/70">
                  {recordsQuery.data.data.slice(0, 15).map((p) => (
                    <li key={p.id} className="py-2">
                      <Link href={`/people/${p.id}`} className="text-body text-ink hover:text-accent">
                        {p.name}
                      </Link>
                      <span className="ml-2 text-caption text-ink-3">
                        {[p.currentTitle, p.currentCompany].filter(Boolean).join(" at ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
