"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import { formatNumber, safeExternalUrl } from "@/lib/format";
import {
  Alert,
  Badge,
  BarList,
  Button,
  Card,
  CardHeader,
  ErrorState,
  LinkButton,
  PageHeader,
  SkeletonCard,
  Stat,
} from "@/components/ui";

export default function CompanyPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => api.company(companyId),
    enabled: Boolean(companyId),
  });
  const company = data?.data;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Loading…" />
        <SkeletonCard className="h-32" />
        <SkeletonCard className="mt-6 h-64" />
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return (
      <div>
        <PageHeader title={notFound ? "Company not found" : "Could not load this company"} />
        {notFound ? (
          <Alert variant="info">
            That company is not in your network.{" "}
            <Link href="/companies" className="text-accent underline">
              Back to Companies
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

  if (!company) return null;
  const linkedin = safeExternalUrl(company.linkedinUrl);
  const current = company.people.filter((p) => p.isCurrent);
  const former = company.people.filter((p) => !p.isCurrent);

  return (
    <div>
      <PageHeader
        title={company.name}
        subtitle={
          [company.industry, company.location].filter(Boolean).join(" · ") || "From your imported network"
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              ← Back
            </Button>
            <LinkButton href={`/graph?companyId=${company.id}`} variant="secondary" size="sm">
              View in graph
            </LinkButton>
            {linkedin && (
              <a
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-secondary font-medium text-white hover:bg-accent-hover focus-ring"
              >
                LinkedIn ↗
              </a>
            )}
          </>
        }
      />

      {company.selfWorkedHere && (
        <Alert variant="info" className="mb-6" title="You have worked here">
          People below who overlap with your time here are strong reconnection candidates.
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Stat label="People you know" value={formatNumber(company.connectionCount)} />
        <Stat label="Currently there" value={formatNumber(company.currentCount)} />
        <Stat label="Previously there" value={formatNumber(company.formerCount)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Your connections here"
            description={`${current.length} current · ${former.length} former`}
            action={
              <Link
                href={`/people?company=${encodeURIComponent(company.name)}`}
                className="text-secondary text-accent hover:underline focus-ring rounded"
              >
                Filter in People
              </Link>
            }
          />
          {company.people.length === 0 ? (
            <p className="px-5 py-8 text-center text-secondary text-ink-3">
              Nobody from your network is recorded at this company.
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {[...current, ...former].map((person) => (
                <li key={person.id}>
                  <Link
                    href={`/people/${person.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-raised/50 focus-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body text-ink">{person.name}</span>
                      <span className="block truncate text-caption text-ink-3">
                        {person.title ?? "Role not recorded"}
                      </span>
                    </span>
                    <Badge tone={person.isCurrent ? "success" : "neutral"}>
                      {person.isCurrent ? "Current" : "Former"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Common titles" />
            <BarList
              emptyMessage="No job titles recorded."
              items={company.topTitles.map((t) => ({ label: t.value, value: t.count }))}
            />
          </Card>

          {company.topSchools.length > 0 && (
            <Card>
              <CardHeader title="Where they studied" />
              <BarList
                emptyMessage="No education data."
                items={company.topSchools.map((s) => ({ label: s.value, value: s.count }))}
              />
            </Card>
          )}

          <Card>
            <CardHeader title="Related companies" description="Other employers of the same people" />
            <BarList
              emptyMessage="No overlapping employers recorded."
              items={company.relatedCompanies.map((c) => ({
                label: c.name,
                value: c.sharedPeople,
                href: `/companies/${c.id}`,
              }))}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
