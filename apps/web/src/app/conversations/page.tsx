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

export default function Conversations() {
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
    queryKey: ["conversations", search, page],
    queryFn: () => api.getConversations({ search, page: String(page), limit: "20" }),
    placeholderData: (prev) => prev,
  });

  const conversations = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader
        title="Conversations"
        subtitle={pagination?.total !== undefined ? `${pagination.total} conversations` : undefined}
      />

      <div className="mb-4">
        <label htmlFor="conv-search" className="sr-only">Search conversations</label>
        <input
          id="conv-search"
          type="search"
          placeholder="Search by title…"
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
        ) : conversations.length === 0 ? (
          <EmptyState
            title={search ? "No matching conversations" : "No conversations yet"}
            description={
              search
                ? `Nothing matches "${search}".`
                : "Conversations are grouped automatically when messages are imported."
            }
            action={!search ? <LinkButton href="/imports" variant="primary">Import your data</LinkButton> : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Conversation</th>
                    <th scope="col">Messages</th>
                    <th scope="col">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.map((conv: any) => (
                    <tr key={conv.id} className={isFetching ? "opacity-60" : undefined}>
                      <td className="font-medium text-ink">{conv.title || "Untitled conversation"}</td>
                      <td className="text-ink-2">{conv.message_count ?? 0}</td>
                      <td className="whitespace-nowrap text-ink-2">
                        {conv.started_at ? new Date(conv.started_at).toLocaleDateString() : "—"}
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
