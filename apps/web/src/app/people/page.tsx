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

export default function People() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounce search input 250ms
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(input);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["people", search, page],
    queryFn: () => api.getPeople({ search, page: String(page), limit: "20" }),
    placeholderData: (prev) => prev, // keep table during page change
  });

  const people = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader
        title="People"
        subtitle={
          pagination?.total !== undefined
            ? `${pagination.total} people in your network`
            : "Everyone in your imported network"
        }
      />

      <div className="mb-4">
        <label htmlFor="people-search" className="sr-only">Search people</label>
        <input
          id="people-search"
          type="search"
          placeholder="Search name, headline or location…"
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
        ) : people.length === 0 ? (
          <EmptyState
            title={search ? "No matches" : "No people yet"}
            description={
              search
                ? `Nothing matches "${search}". Try a different search.`
                : "Import your LinkedIn archive to populate your network."
            }
            action={!search ? <LinkButton href="/imports" variant="primary">Import your data</LinkButton> : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Headline</th>
                    <th scope="col">Location</th>
                    <th scope="col" className="w-10"><span className="sr-only">Profile</span></th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person: any) => (
                    <tr key={person.id} className={isFetching ? "opacity-60" : undefined}>
                      <td className="font-medium text-ink">{person.name || "—"}</td>
                      <td className="text-ink-2 max-w-xs truncate">{person.headline || "—"}</td>
                      <td className="text-ink-2">{person.location || "—"}</td>
                      <td>
                        {person.profile_url && (
                          <a
                            href={person.profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${person.name} on LinkedIn`}
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
