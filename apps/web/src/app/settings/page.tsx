"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatNumber, relativeTime } from "@/lib/format";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DetailList,
  ErrorState,
  PageHeader,
  SkeletonCard,
  Toast,
} from "@/components/ui";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const dashboardQuery = useQuery({ queryKey: ["dashboard"], queryFn: () => api.dashboard() });

  const refresh = useMutation({
    mutationFn: () => api.refreshAnalytics(),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      setToast("Derived analytics recalculated.");
    },
  });

  const reset = useMutation({
    mutationFn: () => api.resetNetwork(),
    onSuccess: async (result) => {
      setConfirmReset(false);
      await queryClient.invalidateQueries();
      setToast(`Deleted ${formatNumber(result.data.deletedPeople)} people and everything derived from them.`);
    },
  });

  const me = meQuery.data?.data;
  const dashboard = dashboardQuery.data?.data;

  if (meQuery.isLoading) {
    return (
      <div>
        <PageHeader title="Settings" />
        <SkeletonCard className="h-48" />
      </div>
    );
  }

  if (meQuery.error) {
    return (
      <div>
        <PageHeader title="Settings" />
        <ErrorState
          message={meQuery.error instanceof Error ? meQuery.error.message : undefined}
          onRetry={() => meQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your workspace, your data, and what happens to it" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" />
          <div className="card-pad">
            <DetailList
              items={[
                { label: "Signed in as", value: me?.user.name ?? me?.user.email ?? "—" },
                { label: "Email", value: me?.user.email ?? "—" },
                { label: "Workspace", value: me?.workspace.name ?? "—" },
                { label: "Role", value: me?.workspace.role ?? "—" },
                {
                  label: "Created",
                  value: me?.workspace.createdAt ? formatDate(me.workspace.createdAt) : "—",
                },
              ]}
            />
            <Alert variant="info" className="mt-5">
              This build runs as a single local operator — there is no sign-in yet. Every query is still
              scoped to the workspace above, so adding real authentication is a change in one place.
            </Alert>
          </div>
        </Card>

        <Card>
          <CardHeader title="Your imported profile" description="From Profile.csv in your LinkedIn archive" />
          <div className="card-pad">
            {dashboard?.self ? (
              <DetailList
                items={[
                  { label: "Name", value: dashboard.self.name },
                  { label: "Headline", value: dashboard.self.headline ?? "Not in export" },
                  { label: "Location", value: dashboard.self.location ?? "Not in export" },
                  { label: "Industry", value: dashboard.self.industry ?? "Not in export" },
                ]}
              />
            ) : (
              <p className="text-secondary text-ink-2">
                Your archive did not include Profile.csv, so SpiderWeb does not know who you are.
                Shared-employer and shared-school signals need it.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Your data" description="Everything SpiderWeb has stored for this workspace" />
        <div className="card-pad">
          <DetailList
            items={[
              { label: "Connections", value: formatNumber(dashboard?.totals.connections ?? 0) },
              { label: "Companies", value: formatNumber(dashboard?.totals.companies ?? 0) },
              { label: "Conversations", value: formatNumber(dashboard?.totals.conversations ?? 0) },
              { label: "Messages", value: formatNumber(dashboard?.totals.messages ?? 0) },
              { label: "Imports", value: formatNumber(dashboard?.totals.imports ?? 0) },
              {
                label: "Last import",
                value: dashboard?.lastImportAt ? relativeTime(dashboard.lastImportAt) : "None yet",
              },
            ]}
          />
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={api.exportUrl("connections.csv")}
              className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-4 text-body font-medium text-ink hover:bg-raised focus-ring"
            >
              Download connections (CSV)
            </a>
            <a
              href={api.exportUrl("companies.csv")}
              className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-4 text-body font-medium text-ink hover:bg-raised focus-ring"
            >
              Download companies (CSV)
            </a>
            <a
              href={api.exportUrl("network.json")}
              className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-4 text-body font-medium text-ink hover:bg-raised focus-ring"
            >
              Download analytics (JSON)
            </a>
          </div>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Maintenance"
          description="Recalculate everything derived from your imports without re-uploading"
        />
        <div className="card-pad">
          <p className="text-secondary text-ink-2">
            Company counts, current roles, career moves and interaction recency are recomputed after every
            import. Run this if you have edited data directly or suspect a figure is stale.
          </p>
          <Button
            className="mt-4"
            variant="secondary"
            loading={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            Recalculate analytics
          </Button>
          {refresh.isError && (
            <Alert variant="danger" className="mt-3">
              {(refresh.error as Error).message}
            </Alert>
          )}
        </div>
      </Card>

      <Card className="mt-6 border-danger/30">
        <CardHeader title="Danger zone" description="These actions cannot be undone" />
        <div className="card-pad">
          <p className="text-secondary text-ink-2">
            Deleting your network removes every person, company, role, message and import record in this
            workspace, including the notes and tags you wrote. Export your data first if you want to keep a
            copy.
          </p>
          <Button variant="danger" className="mt-4" onClick={() => setConfirmReset(true)}>
            Delete all imported data
          </Button>
          {reset.isError && (
            <Alert variant="danger" className="mt-3">
              {(reset.error as Error).message}
            </Alert>
          )}
        </div>
      </Card>

      <p className="mt-6 text-caption text-ink-3">
        Looking for per-import deletion?{" "}
        <Link href="/imports" className="text-accent hover:underline">
          Open Imports
        </Link>{" "}
        and choose an individual import.
      </p>

      <ConfirmDialog
        open={confirmReset}
        title="Delete all imported data?"
        description={
          <>
            <p>
              This permanently removes {formatNumber(dashboard?.totals.connections ?? 0)} people, their
              companies and roles, every message, and the notes and tags you have written.
            </p>
            <p className="mt-2">There is no undo.</p>
          </>
        }
        confirmLabel="Delete everything"
        requireText="DELETE"
        busy={reset.isPending}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
