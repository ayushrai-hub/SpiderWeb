"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import {
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  Pagination,
  SkeletonRows,
} from "@/components/ui";

export default function CompaniesPage() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(input);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["companies", search, page],
    queryFn: () => api.companies({ q: search || undefined, page, limit: 25 }),
    placeholderData: (prev) => prev,
  });

  const companies = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={
          pagination
            ? `${formatNumber(pagination.total)} companies appear in your network`
            : "Derived from where your connections work"
        }
        actions={
          <a
            href={api.exportUrl("companies.csv")}
            className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-secondary font-medium text-ink hover:bg-raised focus-ring"
          >
            Export CSV
          </a>
        }
      />

      <div className="mb-4">
        <label htmlFor="company-search" className="sr-only">
          Search companies
        </label>
        <input
          id="company-search"
          type="search"
          placeholder="Search companies…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="input max-w-md"
        />
      </div>

      <Card>
        {error ? (
          <ErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <SkeletonRows rows={8} cols={4} />
        ) : companies.length === 0 ? (
          <EmptyState
            title={search ? "No matching companies" : "No companies yet"}
            description={
              search
                ? `Nothing matches “${search}”.`
                : "Companies are built from the Company column in Connections.csv and from your own Positions.csv."
            }
            action={
              !search ? (
                <LinkButton href="/imports" variant="primary">
                  Import your data
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col" className="w-28 text-right">
                      People
                    </th>
                    <th scope="col" className="hidden w-28 text-right sm:table-cell">
                      Current
                    </th>
                    <th scope="col" className="hidden w-28 text-right sm:table-cell">
                      Former
                    </th>
                  </tr>
                </thead>
                <tbody className={isFetching ? "opacity-60" : undefined}>
                  {companies.map((company) => (
                    <tr key={company.id}>
                      <td>
                        <Link
                          href={`/companies/${company.id}`}
                          className="font-medium text-ink hover:text-accent focus-ring rounded"
                        >
                          {company.name}
                        </Link>
                        {company.industry && (
                          <span className="ml-2 text-caption text-ink-3">{company.industry}</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums text-ink">{company.connectionCount}</td>
                      <td className="hidden text-right tabular-nums text-ink-2 sm:table-cell">
                        {company.currentCount}
                      </td>
                      <td className="hidden text-right tabular-nums text-ink-2 sm:table-cell">
                        {company.formerCount}
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
