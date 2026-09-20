"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatDuration, formatNumber, relativeTime } from "@/lib/format";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SkeletonRows,
} from "@/components/ui";
import { ImportDropzone } from "@/components/import/ImportDropzone";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/import-status";

export default function ImportsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["imports", page],
    queryFn: () => api.imports({ page, limit: 20 }),
    // Poll only while something is in flight.
    refetchInterval: (query) => {
      const rows = query.state.data?.data ?? [];
      return rows.some((r) => r.status === "pending" || r.status === "processing") ? 1500 : false;
    },
  });

  const imports = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader title="Imports" subtitle="Upload a LinkedIn export and see exactly what happened to it" />

      <Card className="mb-6">
        <CardHeader title="New import" description="ZIP archive or individual CSV files" />
        <div className="p-5">
          <ImportDropzone />
        </div>
      </Card>

      <Card>
        <CardHeader title="History" />
        {error ? (
          <ErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <SkeletonRows rows={4} cols={5} />
        ) : imports.length === 0 ? (
          <EmptyState
            title="No imports yet"
            description="Your first import will appear here with a full breakdown of what was read."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="hidden text-right sm:table-cell">
                      Imported
                    </th>
                    <th scope="col" className="hidden text-right md:table-cell">
                      Updated
                    </th>
                    <th scope="col" className="hidden text-right md:table-cell">
                      Duplicates
                    </th>
                    <th scope="col" className="text-right">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link
                          href={`/imports/${row.id}`}
                          className="font-medium text-ink hover:text-accent focus-ring rounded"
                        >
                          {row.filename ?? "Upload"}
                        </Link>
                        <span className="ml-2 text-caption text-ink-3">
                          {row.fileCount} file{row.fileCount === 1 ? "" : "s"}
                          {row.durationMs !== null && ` · ${formatDuration(row.durationMs)}`}
                        </span>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                        {row.errorMessage && (
                          <p className="mt-1 max-w-xs text-caption text-danger">{row.errorMessage}</p>
                        )}
                      </td>
                      <td className="hidden text-right tabular-nums text-ink sm:table-cell">
                        {formatNumber(row.recordsImported)}
                      </td>
                      <td className="hidden text-right tabular-nums text-ink-2 md:table-cell">
                        {formatNumber(row.recordsUpdated)}
                      </td>
                      <td className="hidden text-right tabular-nums text-ink-2 md:table-cell">
                        {formatNumber(row.recordsDuplicate)}
                      </td>
                      <td
                        className="whitespace-nowrap text-right text-ink-2"
                        title={formatDate(row.uploadedAt)}
                      >
                        {relativeTime(row.uploadedAt)}
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
