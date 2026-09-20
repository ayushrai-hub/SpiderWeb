"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type PeopleQuery } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import type { SignalKey } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  Pagination,
  Select,
  SkeletonRows,
} from "@/components/ui";

const SORTS = [
  { value: "connected_desc", label: "Newest connection" },
  { value: "connected_asc", label: "Oldest connection" },
  { value: "name", label: "Name (A–Z)" },
  { value: "company", label: "Company" },
  { value: "interaction", label: "Most recent contact" },
];

const FILTER_KEYS = [
  "q",
  "company",
  "pastCompany",
  "title",
  "school",
  "tag",
  "signals",
  "sort",
  "industry",
  "location",
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function PeopleView() {
  const router = useRouter();
  const params = useSearchParams();

  const read = useCallback((key: FilterKey) => params.get(key) ?? "", [params]);

  const [searchInput, setSearchInput] = useState(read("q"));
  const [page, setPage] = useState(1);

  // Keep the box in sync when the URL changes from elsewhere (e.g. a signal link).
  useEffect(() => {
    setSearchInput(params.get("q") ?? "");
    setPage(1);
  }, [params]);

  const setFilter = useCallback(
    (key: FilterKey, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`/people${next.toString() ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== read("q")) setFilter("q", searchInput);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, read, setFilter]);

  const query: PeopleQuery = useMemo(
    () => ({
      q: read("q") || undefined,
      company: read("company") || undefined,
      pastCompany: read("pastCompany") || undefined,
      title: read("title") || undefined,
      location: read("location") || undefined,
      industry: read("industry") || undefined,
      school: read("school") || undefined,
      tag: read("tag") || undefined,
      signals: read("signals") || undefined,
      sort: read("sort") || undefined,
      page,
      limit: 25,
    }),
    [read, page]
  );

  const { data: facetData } = useQuery({
    queryKey: ["facets"],
    queryFn: () => api.facets(),
    staleTime: 120_000,
  });
  const facets = facetData?.data;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["people", query],
    queryFn: () => api.people(query),
    placeholderData: (prev) => prev,
  });

  const people = data?.data ?? [];
  const pagination = data?.pagination;
  const activeFilters = FILTER_KEYS.filter((k) => k !== "sort" && read(k));

  const signalLabel = (key: SignalKey): string => facets?.signals.find((s) => s.key === key)?.label ?? key;

  return (
    <div>
      <PageHeader
        title="People"
        subtitle={
          pagination
            ? `${formatNumber(pagination.total)} of your connections match`
            : "Everyone in your imported network"
        }
        actions={
          <a
            href={api.exportUrl("connections.csv")}
            className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-secondary font-medium text-ink hover:bg-raised focus-ring"
          >
            Export CSV
          </a>
        }
      />

      <Card className="mb-4">
        <div className="card-pad space-y-4">
          <div>
            <label htmlFor="people-search" className="label">
              Search
            </label>
            <input
              id="people-search"
              type="search"
              placeholder="Name, company, title…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Current company"
              value={read("company")}
              onChange={(v) => setFilter("company", v)}
              options={(facets?.companies ?? []).map((c) => ({
                value: c.value,
                label: `${c.value} (${c.count})`,
              }))}
            />
            <Select
              label="Job title"
              value={read("title")}
              onChange={(v) => setFilter("title", v)}
              options={(facets?.titles ?? []).map((t) => ({
                value: t.value,
                label: `${t.value} (${t.count})`,
              }))}
            />
            <Select
              label="Location"
              value={read("location")}
              onChange={(v) => setFilter("location", v)}
              options={(facets?.locations ?? []).map((c) => ({
                value: c.value,
                label: `${c.value} (${c.count})`,
              }))}
              placeholder={facets && facets.locations.length === 0 ? "No location data" : "Any"}
            />
            <Select
              label="Industry"
              value={read("industry")}
              onChange={(v) => setFilter("industry", v)}
              options={(facets?.industries ?? []).map((c) => ({
                value: c.value,
                label: `${c.value} (${c.count})`,
              }))}
              placeholder={facets && facets.industries.length === 0 ? "No industry data" : "Any"}
            />
            <Select
              label="School"
              value={read("school")}
              onChange={(v) => setFilter("school", v)}
              options={(facets?.schools ?? []).map((s) => ({
                value: s.value,
                label: `${s.value} (${s.count})`,
              }))}
              placeholder={facets && facets.schools.length === 0 ? "No school data" : "Any"}
            />
            <Select
              label="Tag"
              value={read("tag")}
              onChange={(v) => setFilter("tag", v)}
              options={(facets?.tags ?? []).map((t) => ({
                value: t.value,
                label: `${t.value} (${t.count})`,
              }))}
              placeholder={facets && facets.tags.length === 0 ? "No tags yet" : "Any"}
            />
          </div>

          <div>
            <p className="label">Signals</p>
            <div className="flex flex-wrap gap-1.5">
              {(facets?.signals ?? []).map((signal) => {
                const active = read("signals") === signal.key;
                const disabled = signal.count === 0 && !active;
                return (
                  <button
                    key={signal.key}
                    type="button"
                    title={signal.rule}
                    disabled={disabled}
                    onClick={() => setFilter("signals", active ? "" : signal.key)}
                    className={`rounded-full border px-2.5 py-1 text-caption transition-colors focus-ring ${
                      active
                        ? "border-accent bg-accent text-white"
                        : disabled
                          ? "cursor-not-allowed border-line text-ink-3"
                          : "border-line-strong text-ink-2 hover:bg-raised"
                    }`}
                  >
                    {signal.label} <span className="tabular-nums opacity-70">{signal.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full max-w-[14rem]">
              <Select
                label="Sort by"
                value={read("sort")}
                onChange={(v) => setFilter("sort", v)}
                options={SORTS}
                placeholder="Newest connection"
              />
            </div>
            {activeFilters.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => router.replace("/people")}>
                Clear {activeFilters.length} filter{activeFilters.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        {error ? (
          <ErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <SkeletonRows rows={8} cols={4} />
        ) : people.length === 0 ? (
          <EmptyState
            title={activeFilters.length ? "Nothing matches those filters" : "No people yet"}
            description={
              activeFilters.length
                ? "Try removing a filter or searching for something broader."
                : "Import your LinkedIn archive and your connections will appear here."
            }
            action={
              activeFilters.length ? (
                <Button variant="secondary" onClick={() => router.replace("/people")}>
                  Clear filters
                </Button>
              ) : (
                <LinkButton href="/imports" variant="primary">
                  Import your data
                </LinkButton>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Role</th>
                    <th scope="col" className="hidden md:table-cell">
                      Signals
                    </th>
                    <th scope="col" className="hidden sm:table-cell">
                      Connected
                    </th>
                  </tr>
                </thead>
                <tbody className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
                  {people.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <Link
                          href={`/people/${person.id}`}
                          className="font-medium text-ink hover:text-accent focus-ring rounded"
                        >
                          {person.name}
                        </Link>
                        {person.tags.length > 0 && (
                          <span className="ml-2 inline-flex gap-1">
                            {person.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} tone="accent">
                                {tag}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="max-w-xs truncate text-ink-2">
                        {[person.currentTitle, person.currentCompany].filter(Boolean).join(" at ") || "—"}
                      </td>
                      <td className="hidden md:table-cell">
                        <span className="flex flex-wrap gap-1">
                          {person.signals.slice(0, 3).map((s) => (
                            <Badge key={s} tone="neutral">
                              {signalLabel(s)}
                            </Badge>
                          ))}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap text-ink-2 sm:table-cell">
                        {formatDate(person.connectedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && (
              <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={setPage} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} cols={4} />}>
      <PeopleView />
    </Suspense>
  );
}
