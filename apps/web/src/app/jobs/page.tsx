"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatNumber, safeExternalUrl } from "@/lib/format";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  Pagination,
  SkeletonRows,
} from "@/components/ui";

export default function JobsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["jobs", page],
    queryFn: () => api.jobs({ page, limit: 25 }),
    placeholderData: (prev) => prev,
  });

  const jobs = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <PageHeader title="Jobs" subtitle="Roles you applied for or saved, with who you know at each company" />

      <Card>
        {error ? (
          <ErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <SkeletonRows rows={5} cols={4} />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No jobs in your export"
            description="Job applications and saved jobs are only in the complete LinkedIn archive, under the jobs/ folder."
            action={
              <LinkButton href="/imports" variant="primary">
                Import more data
              </LinkButton>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Role</th>
                    <th scope="col">Company</th>
                    <th scope="col" className="hidden text-right sm:table-cell">
                      You know
                    </th>
                    <th scope="col" className="text-right">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const url = safeExternalUrl(job.url);
                    return (
                      <tr key={job.id}>
                        <td className="text-ink">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium hover:text-accent focus-ring rounded"
                            >
                              {job.title} ↗
                            </a>
                          ) : (
                            <span className="font-medium">{job.title}</span>
                          )}
                          <span className="ml-2">
                            <Badge tone={job.appliedAt ? "accent" : "neutral"}>
                              {job.appliedAt ? "Applied" : "Saved"}
                            </Badge>
                          </span>
                        </td>
                        <td className="text-ink-2">
                          {job.companyId ? (
                            <Link
                              href={`/companies/${job.companyId}`}
                              className="hover:text-accent focus-ring rounded"
                            >
                              {job.companyName}
                            </Link>
                          ) : (
                            (job.companyName ?? "—")
                          )}
                        </td>
                        <td className="hidden text-right sm:table-cell">
                          {job.connectionsAtCompany > 0 && job.companyId ? (
                            <Link
                              href={`/companies/${job.companyId}`}
                              className="tabular-nums text-accent hover:underline focus-ring rounded"
                            >
                              {formatNumber(job.connectionsAtCompany)}
                            </Link>
                          ) : (
                            <span className="tabular-nums text-ink-3">0</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right text-ink-2">
                          {formatDate(job.appliedAt ?? job.savedAt)}
                        </td>
                      </tr>
                    );
                  })}
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
