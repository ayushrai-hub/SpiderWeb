"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Alert, Button, Card, CardHeader, ErrorState, PageHeader, SkeletonCard } from "@/components/ui";

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => api.conversation(conversationId),
    enabled: Boolean(conversationId),
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Conversation" />
        <SkeletonCard className="h-96" />
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return (
      <div>
        <PageHeader title={notFound ? "Conversation not found" : "Could not load this conversation"} />
        {notFound ? (
          <Alert variant="info">
            That conversation no longer exists.{" "}
            <Link href="/conversations" className="text-accent underline">
              Back to Conversations
            </Link>
          </Alert>
        ) : (
          <ErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        )}
      </div>
    );
  }

  const conversation = data?.data;
  if (!conversation) return null;

  return (
    <div>
      <PageHeader
        title={conversation.title}
        subtitle={`${conversation.messageCount} messages · started ${formatDate(conversation.startedAt)}`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              ← Back
            </Button>
            {conversation.person && (
              <Link
                href={`/people/${conversation.person.id}`}
                className="inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-3 text-secondary font-medium text-ink hover:bg-raised focus-ring"
              >
                View profile
              </Link>
            )}
          </>
        }
      />

      <Card>
        <CardHeader title="Messages" description="Exactly as exported by LinkedIn" />
        <ul className="space-y-3 p-5">
          {conversation.messages.map((message) => {
            const outbound = message.direction === "outbound";
            return (
              <li key={message.id} className={outbound ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[80%] rounded-lg border px-4 py-2.5 ${
                    outbound ? "border-accent/20 bg-accent-soft" : "border-line bg-raised/50"
                  }`}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-4">
                    <span className="text-caption font-medium text-ink-2">
                      {outbound ? "You" : (message.senderName ?? "Them")}
                    </span>
                    <span className="text-caption text-ink-3">{formatDate(message.sentAt)}</span>
                  </div>
                  {message.subject && (
                    <p className="text-secondary font-medium text-ink">{message.subject}</p>
                  )}
                  <p className="whitespace-pre-wrap text-body text-ink">
                    {message.content || <em className="text-ink-3">No content</em>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
