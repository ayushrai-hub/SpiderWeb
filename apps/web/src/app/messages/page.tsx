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

const DIRECTIONS = ["all", "inbound", "outbound"] as const;

export default function Messages() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>("all");

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(input);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["messages", search, page, direction],
    queryFn: () =>
      api.getMessages({
        search,
        page: String(page),
        limit: "20",
        ...(direction !== "all" ? { direction } : {}),
      }),
    placeholderData: (prev) => prev,
  });

  const messages = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle={pagination?.total !== undefined ? `${pagination.total} messages` : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="msg-search" className="sr-only">Search messages</label>
        <input
          id="msg-search"
          type="search"
          placeholder="Search message content…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="input max-w-md"
        />
        <div role="radiogroup" aria-label="Filter by direction" className="flex rounded-md border border-line-strong p-0.5">
          {DIRECTIONS.map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={direction === d}
              onClick={() => { setDirection(d); setPage(1); }}
              className={`rounded px-3 py-1 text-secondary capitalize transition-colors focus-ring ${
                direction === d ? "bg-raised font-medium text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} cols={4} />
        ) : messages.length === 0 ? (
          <EmptyState
            title={search || direction !== "all" ? "No matching messages" : "No messages yet"}
            description={
              search || direction !== "all"
                ? "Try clearing the search or direction filter."
                : "Messages from your LinkedIn import appear here."
            }
            action={!search && direction === "all" ? <LinkButton href="/imports" variant="primary">Import your data</LinkButton> : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Content</th>
                    <th scope="col">Date</th>
                    <th scope="col">Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg: any) => (
                    <tr key={msg.id} className={isFetching ? "opacity-60" : undefined}>
                      <td className="max-w-lg">
                        <p className="truncate text-ink">{msg.content || "—"}</p>
                        {msg.source_file && (
                          <p className="text-caption text-ink-3">{msg.source_file}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-ink-2">
                        {msg.sent_at || msg.createdAt
                          ? new Date(msg.sent_at || msg.createdAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td>
                        <span className={`badge ${msg.direction === "outbound" ? "badge-accent" : "badge-neutral"}`}>
                          {msg.direction === "outbound" ? "Sent" : "Received"}
                        </span>
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
