"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import { formatBytes, formatDate, formatDuration, formatNumber } from "@/lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DetailList,
  ErrorState,
  LinkButton,
  PageHeader,
  SkeletonCard,
  Stat,
  Toast,
} from "@/components/ui";
import { recoveryAdvice, STATUS_LABEL, STATUS_TONE } from "@/lib/import-status";

const FILE_STATUS_TONE = {
  normalized: "success",
  parsed: "accent",
  skipped: "neutral",
  failed: "danger",
} as const;

const FILE_STATUS_LABEL = {
  normalized: "Imported",
  parsed: "Parsed",
  skipped: "Skipped",
  failed: "Failed",
} as const;

export default function ImportDetailPage() {
  const { importId } = useParams<{ importId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<null | "record" | "withData">(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["import", importId],
    queryFn: () => api.importDetail(importId),
    enabled: Boolean(importId),
    refetchInterval: (query) => {
      const status = query.state.data?.data.status;
      return status === "pending" || status === "processing" ? 1000 : false;
    },
  });

  const remove = useMutation({
    mutationFn: (withData: boolean) => api.deleteImport(importId, withData),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/imports");
      void result;
    },
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Import" />
        <SkeletonCard className="h-32" />
        <SkeletonCard className="mt-6 h-64" />
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return (
      <div>
        <PageHeader title={notFound ? "Import not found" : "Could not load this import"} />
        {notFound ? (
          <Alert variant="info">
            That import no longer exists.{" "}
            <Link href="/imports" className="text-accent underline">
              Back to Imports
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

  const record = data?.data;
  if (!record) return null;

  const inFlight = record.status === "pending" || record.status === "processing";
  const imported = record.files.filter((f) => f.dataset);
  const skipped = record.files.filter((f) => !f.dataset);
  const stats = record.metadata.stats ?? {};

  return (
    <div>
      <PageHeader
        title={record.filename ?? "Import"}
        subtitle={`Uploaded ${formatDate(record.uploadedAt)}`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => router.push("/imports")}>
              ← All imports
            </Button>
            {!inFlight && (
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete("record")}>
                Delete
              </Button>
            )}
          </>
        }
      />

      {inFlight && (
        <Card className="mb-6">
          <div className="card-pad flex items-center gap-4">
            <span
              aria-hidden
              className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
            />
            <div>
              <p className="text-h3 text-ink">
                {record.status === "pending" ? "Queued for processing" : "Processing your export"}
              </p>
              <p className="text-secondary text-ink-2">
                Extracting, detecting datasets, normalising and saving. This page updates itself.
              </p>
            </div>
          </div>
        </Card>
      )}

      {record.status === "failed" && (
        <Alert variant="danger" className="mb-6" title="This import failed">
          <p>
            {record.errorMessage ?? "Something went wrong while processing the file."}
            {record.errorCode && <span className="ml-1 text-caption opacity-70">({record.errorCode})</span>}
          </p>
          {recoveryAdvice(record.errorCode) && <p className="mt-2">{recoveryAdvice(record.errorCode)}</p>}
          <LinkButton href="/imports" variant="secondary" size="sm" className="mt-3">
            Try another upload
          </LinkButton>
        </Alert>
      )}

      {record.status === "partially_completed" && (
        <Alert variant="warning" className="mb-6" title="Some files could not be processed">
          Everything that could be read was imported. The per-file breakdown below shows what failed.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat
          label="Status"
          value={<Badge tone={STATUS_TONE[record.status]}>{STATUS_LABEL[record.status]}</Badge>}
        />
        <Stat label="Records found" value={formatNumber(record.recordsDiscovered)} />
        <Stat label="Imported" value={formatNumber(record.recordsImported)} />
        <Stat label="Updated" value={formatNumber(record.recordsUpdated)} />
        <Stat
          label="Duplicates"
          value={formatNumber(record.recordsDuplicate)}
          hint="Already in your network"
        />
      </div>

      <Card className="mt-6">
        <CardHeader title="What was created" description="Counts of new records written by this import" />
        <div className="card-pad">
          {Object.keys(stats).length === 0 ? (
            <p className="text-secondary text-ink-3">No breakdown recorded for this import.</p>
          ) : (
            <DetailList
              items={[
                { label: "People", value: formatNumber(stats.peopleCreated) },
                { label: "People updated", value: formatNumber(stats.peopleUpdated) },
                { label: "Connections", value: formatNumber(stats.connectionsCreated) },
                { label: "Companies", value: formatNumber(stats.companiesCreated) },
                { label: "Roles", value: formatNumber(stats.employmentCreated) },
                { label: "Education", value: formatNumber(stats.educationCreated) },
                { label: "Skills", value: formatNumber(stats.skillsCreated) },
                { label: "Messages", value: formatNumber(stats.messagesCreated) },
                { label: "Activities", value: formatNumber(stats.activitiesCreated) },
                { label: "Jobs", value: formatNumber(stats.jobsCreated) },
                { label: "Processing time", value: formatDuration(record.durationMs) },
              ]}
            />
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Files read"
          description={`${imported.length} recognised · ${skipped.length} skipped`}
        />
        {record.files.length === 0 ? (
          <p className="px-5 py-8 text-center text-secondary text-ink-3">No file records for this import.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Dataset</th>
                  <th scope="col">Result</th>
                  <th scope="col" className="hidden text-right sm:table-cell">
                    Rows
                  </th>
                  <th scope="col" className="hidden text-right sm:table-cell">
                    Imported
                  </th>
                  <th scope="col" className="hidden text-right md:table-cell">
                    Rejected
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...imported, ...skipped].map((file) => (
                  <tr key={`${file.filename}-${file.dataset ?? "none"}`}>
                    <td className="max-w-xs truncate text-ink" title={file.filename}>
                      {file.filename}
                      {file.fileSize > 0 && (
                        <span className="ml-2 text-caption text-ink-3">{formatBytes(file.fileSize)}</span>
                      )}
                    </td>
                    <td className="text-ink-2">{file.dataset ?? "—"}</td>
                    <td>
                      <Badge tone={FILE_STATUS_TONE[file.status]}>{FILE_STATUS_LABEL[file.status]}</Badge>
                      {file.reason && <p className="mt-1 max-w-xs text-caption text-ink-3">{file.reason}</p>}
                      {file.errors.length > 0 && (
                        <p className="mt-1 max-w-xs text-caption text-danger">{file.errors[0]}</p>
                      )}
                      {file.warnings.length > 0 && (
                        <p className="mt-1 max-w-xs text-caption text-warning">{file.warnings[0]}</p>
                      )}
                    </td>
                    <td className="hidden text-right tabular-nums text-ink-2 sm:table-cell">
                      {formatNumber(file.recordsDiscovered)}
                    </td>
                    <td className="hidden text-right tabular-nums text-ink sm:table-cell">
                      {formatNumber(file.recordsImported)}
                    </td>
                    <td className="hidden text-right tabular-nums text-ink-2 md:table-cell">
                      {formatNumber(file.recordsRejected)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {record.status === "completed" && record.recordsImported > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          <LinkButton href="/" variant="primary">
            Open dashboard
          </LinkButton>
          <LinkButton href="/people" variant="secondary">
            Browse people
          </LinkButton>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this import?"
        description={
          <>
            <p>The import record and its file breakdown will be removed.</p>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-danger"
                checked={confirmDelete === "withData"}
                onChange={(e) => setConfirmDelete(e.target.checked ? "withData" : "record")}
              />
              <span>
                Also delete the people this import introduced. People who also appear in another import are
                kept.
              </span>
            </label>
          </>
        }
        confirmLabel="Delete import"
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => remove.mutate(confirmDelete === "withData")}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
