"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { GraphNode } from "@/lib/types";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  SkeletonCard,
} from "@/components/ui";
import { NetworkGraph } from "@/components/graph/NetworkGraph";

function GraphView() {
  const router = useRouter();
  const params = useSearchParams();
  const companyId = params.get("companyId") ?? undefined;

  const [minSize, setMinSize] = useState(1);
  const [includeSchools, setIncludeSchools] = useState(true);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["graph", companyId, minSize, includeSchools],
    queryFn: () => api.graph({ companyId, minSize, includeSchools }),
  });
  const graph = data?.data;

  const focus = (node: GraphNode) => {
    setSelected(node);
    if (node.type === "company" && node.entityId && !companyId) {
      router.push(`/graph?companyId=${node.entityId}`);
    }
  };

  return (
    <div>
      <PageHeader
        title="Network graph"
        subtitle={
          graph?.mode === "company"
            ? "People affiliated with one company"
            : "Affiliation graph: you, employers, and schools — not who-knows-whom"
        }
        actions={
          companyId ? (
            <Button variant="secondary" size="sm" onClick={() => router.push("/graph")}>
              Back to overview
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <div className="card-pad flex flex-wrap items-end gap-6">
          <div>
            <label htmlFor="min-size" className="label">
              Hide groups smaller than
            </label>
            <div className="flex items-center gap-3">
              <input
                id="min-size"
                type="range"
                min={1}
                max={10}
                value={minSize}
                onChange={(e) => setMinSize(Number(e.target.value))}
                className="w-40 accent-accent"
              />
              <span className="tabular-nums text-secondary text-ink-2">
                {minSize} {minSize === 1 ? "person" : "people"}
              </span>
            </div>
          </div>
          <label className="flex items-center gap-2 text-secondary text-ink-2">
            <input
              type="checkbox"
              checked={includeSchools}
              onChange={(e) => setIncludeSchools(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Show schools
          </label>
        </div>
      </Card>

      {error ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
      ) : isLoading ? (
        <SkeletonCard className="h-[560px]" />
      ) : !graph || graph.nodes.length <= 1 ? (
        <Card>
          <EmptyState
            title="Nothing to draw yet"
            description="The graph is built from the companies and schools in your import. Import your LinkedIn export to see it."
            action={
              <LinkButton href="/imports" variant="primary">
                Import your data
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          <Card className="lg:col-span-3">
            <NetworkGraph data={graph} onSelect={focus} selectedId={selected?.id ?? null} />
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Selection" />
              <div className="card-pad">
                {!selected ? (
                  <p className="text-secondary text-ink-3">Click a node to see what it represents.</p>
                ) : (
                  <>
                    <p className="text-h3 text-ink">{selected.label}</p>
                    <p className="mt-0.5 text-secondary text-ink-2">
                      {selected.type === "self"
                        ? "You"
                        : `${formatNumber(selected.size)} ${selected.size === 1 ? "person" : "people"}`}
                    </p>
                    {selected.meta?.current !== undefined && (
                      <p className="mt-1 text-caption text-ink-3">
                        {selected.meta.current} current · {selected.meta.former} former
                      </p>
                    )}
                    <div className="mt-4 space-y-2">
                      {selected.type === "company" && selected.entityId && (
                        <LinkButton
                          href={`/companies/${selected.entityId}`}
                          variant="secondary"
                          size="sm"
                          className="w-full justify-start"
                        >
                          Open company
                        </LinkButton>
                      )}
                      {selected.type === "person" && selected.entityId && (
                        <LinkButton
                          href={`/people/${selected.entityId}`}
                          variant="secondary"
                          size="sm"
                          className="w-full justify-start"
                        >
                          Open profile
                        </LinkButton>
                      )}
                      {selected.type === "school" && (
                        <LinkButton
                          href={`/people?school=${encodeURIComponent(selected.label)}`}
                          variant="secondary"
                          size="sm"
                          className="w-full justify-start"
                        >
                          See alumni
                        </LinkButton>
                      )}
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="What you are seeing" />
              <div className="card-pad text-secondary text-ink-2">
                <p>
                  {graph.caveat ??
                    "This is an affiliation graph. LinkedIn exports do not say which of your connections know each other. Sharing a company is not evidence of a personal relationship."}
                </p>
                {graph.truncated.hiddenCompanies > 0 && (
                  <p className="mt-2 text-ink-3">
                    {graph.truncated.hiddenCompanies} smaller companies are collapsed into one node.
                  </p>
                )}
                {graph.truncated.hiddenPeople > 0 && (
                  <Alert variant="info" className="mt-3">
                    Showing the first 300 people at this company.{" "}
                    <Link
                      href={`/people?company=${encodeURIComponent(graph.nodes.find((n) => n.type === "company")?.label ?? "")}`}
                      className="underline"
                    >
                      See all in People
                    </Link>
                    .
                  </Alert>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<SkeletonCard className="h-[560px]" />}>
      <GraphView />
    </Suspense>
  );
}
