"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Card,
  PageHeader,
  EmptyState,
  ErrorState,
  SkeletonRows,
  Pagination,
  LinkButton,
} from "@/components/ui";

export default function Companies() {
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

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["companies", search, page],
    queryFn: () => api.getCompanies({ search, page: String(page), limit: "20" }),
    placeholderData: (prev) => prev,
  });

  const companies = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={pagination?.total !== undefined ? `${pagination.total} companies` : undefined}
      />

      <div className="mb-4">
        <label htmlFor="co-search" className="sr-only">Search companies</label>
        <input
          id="co-search"
          type="search"
          placeholder="Search companies…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="input max-w-md"
        />
      </div>

      <Card>
        {error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} cols={4} />
        ) : companies.length === 0 ? (
          <EmptyState
            title={search ? "No matching companies" : "No companies yet"}
            description={
              search
                ? `Nothing matches "${search}".`
                : "Companies come from your Positions and Connections imports."
            }
            action={!search ? <LinkButton href="/imports" variant="primary">Import your data</LinkButton> : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col">Industry</th>
                    <th scope="col">Location</th>
                    <th scope="col" className="w-10"><span className="sr-only">LinkedIn</span></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company: any) => (
                    <tr key={company.id} className={isFetching ? "opacity-60" : undefined}>
                      <td className="font-medium text-ink">{company.canonical_name ?? company.name ?? "—"}</td>
                      <td className="text-ink-2">{company.industry || "—"}</td>
                      <td className="text-ink-2">{company.location || "—"}</td>
                      <td>
                        {(company.linkedin_url || company.linkedinUrl) && (
                          <a
                            href={company.linkedin_url || company.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${company.canonical_name ?? company.name} on LinkedIn`}
                            className="text-accent hover:underline focus-ring rounded"
                          >
                            ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && (
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onChange={setPage}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
