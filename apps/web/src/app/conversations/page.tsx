"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatNumber, relativeTime } from "@/lib/format";
import {
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  Pagination,
  SkeletonRows,
} from "@/components/ui";

export default function ConversationsPage() {
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
    queryKey: ["conversations", search, page],
    queryFn: () => api.conversations({ q: search || undefined, page, limit: 25 }),
    placeholderData: (prev) => prev,
  });

  const conversations = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader
        title="Conversations"
        subtitle={
          pagination
            ? `${formatNumber(pagination.total)} message threads from your export`
            : "LinkedIn message threads"
        }
      />

      <div className="mb-4">
        <label htmlFor="conv-search" className="sr-only">
          Search conversations
        </label>
        <input
          id="conv-search"
          type="search"
          placeholder="Search by person…"
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
          <SkeletonRows rows={6} cols={3} />
        ) : conversations.length === 0 ? (
          <EmptyState
            title={search ? "No matching conversations" : "No conversations"}
            description={
              search
                ? `Nothing matches “${search}”.`
                : "Messages only appear if your LinkedIn archive included messages.csv — request the complete archive to get them."
            }
            action={
              !search ? (
                <LinkButton href="/imports" variant="primary">
                  Import more data
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className={`divide-y divide-line/70 ${isFetching ? "opacity-60" : ""}`}>
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/conversations/${conversation.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-raised/50 focus-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-ink">
                        {conversation.title}
                      </span>
                      <span className="block truncate text-caption text-ink-3">
                        {conversation.person?.currentCompany ?? "Not matched to a connection"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-secondary text-ink-2">
                        {conversation.messageCount} messages
                      </span>
                      <span className="block text-caption text-ink-3">
                        {relativeTime(conversation.lastMessageAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {pagination && (
              <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={setPage} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
