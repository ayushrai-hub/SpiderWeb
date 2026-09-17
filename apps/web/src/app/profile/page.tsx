"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardHeader,
  PageHeader,
  Stat,
  SkeletonCard,
  ErrorState,
  EmptyState,
  LinkButton,
} from "@/components/ui";

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Profile() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.getProfile(),
  });

  const profile = data?.data;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Profile" />
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard className="h-44" />
          <SkeletonCard className="h-44" />
        </div>
        <SkeletonCard className="mt-6 h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Profile" />
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  if (!profile?.hasData) {
    return (
      <div>
        <PageHeader title="Profile" subtitle="Your professional intelligence profile" />
        <Card>
          <EmptyState
            title="No profile data yet"
            description="Import your LinkedIn archive and SpiderWeb builds your career timeline, education and network profile automatically."
            action={<LinkButton href="/imports" variant="primary">Import your LinkedIn data</LinkButton>}
          />
        </Card>
      </div>
    );
  }

  const { identity, career, education, skills, network } = profile;
  const currentRole = career.find((c: any) => c.isCurrent) ?? career[0];

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Built from your imported data — nothing here is invented"
      />

      {/* Identity */}
      <Card className="mb-6">
        <div className="card-pad flex items-start gap-5">
          <div
            aria-hidden
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-xl font-semibold text-accent"
          >
            {initials(identity.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-h2 text-ink">{identity.name ?? "Unnamed profile"}</h2>
            {identity.headline && (
              <p className="mt-0.5 text-body text-ink-2">{identity.headline}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-secondary text-ink-3">
              {currentRole?.company && <span>{currentRole.company}</span>}
              {identity.location && <span>{identity.location}</span>}
              {identity.email && <span>{identity.email}</span>}
              {identity.profileUrl && (
                <a
                  href={identity.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline focus-ring rounded"
                >
                  LinkedIn profile ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Network stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Connections" value={network.connections} />
        <Stat label="Companies" value={network.companies} />
        <Stat label="Messages" value={network.messages} />
        <Stat
          label="Last import"
          value={
            network.lastImportAt
              ? new Date(network.lastImportAt).toLocaleDateString()
              : "—"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Career */}
        <Card>
          <CardHeader title="Career" description="From Positions.csv" />
          <div className="card-pad">
            {career.length === 0 ? (
              <p className="py-6 text-center text-secondary text-ink-3">
                No positions found in your import.
              </p>
            ) : (
              <ol className="relative space-y-5 border-l border-line pl-5">
                {career.map((job: any, i: number) => (
                  <li key={i} className="relative">
                    <span
                      aria-hidden
                      className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface ${
                        job.isCurrent ? "bg-accent" : "bg-line-strong"
                      }`}
                    />
                    <p className="text-h3 text-ink">
                      {job.title || "Unknown role"}
                      {job.isCurrent && (
                        <span className="badge badge-accent ml-2">Current</span>
                      )}
                    </p>
                    <p className="text-secondary text-ink-2">
                      {job.company || "—"}
                      {(job.startDate || job.endDate) && (
                        <span className="text-ink-3">
                          {" · "}
                          {job.startDate ?? "?"} – {job.endDate ?? "present"}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>

        {/* Education */}
        <Card>
          <CardHeader title="Education" description="From Education.csv" />
          <div className="card-pad">
            {education.length === 0 ? (
              <p className="py-6 text-center text-secondary text-ink-3">
                No education records found in your import.
              </p>
            ) : (
              <ul className="space-y-4">
                {education.map((e: any, i: number) => (
                  <li key={i} className="border-b border-line/70 pb-4 last:border-0 last:pb-0">
                    <p className="text-h3 text-ink">{e.school || "Unknown school"}</p>
                    <p className="text-secondary text-ink-2">
                      {[e.degree, e.field].filter(Boolean).join(", ") || "—"}
                    </p>
                    {(e.start || e.end) && (
                      <p className="mt-0.5 text-caption text-ink-3">
                        {e.start ?? "?"} – {e.end ?? "present"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* Skills */}
      <Card className="mt-6">
        <CardHeader title="Skills" description="From Skills.csv" />
        <div className="card-pad">
          {skills.length === 0 ? (
            <p className="py-6 text-center text-secondary text-ink-3">
              No skills found in your import.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skills.map((s: any, i: number) => (
                <span
                  key={`${s.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised/60 px-3 py-1 text-secondary text-ink"
                >
                  {s.name}
                  {s.endorsements > 0 && (
                    <span className="text-caption text-ink-3">{s.endorsements}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
