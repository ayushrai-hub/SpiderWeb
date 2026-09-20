"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import { formatDate, initials, relativeTime, safeExternalUrl } from "@/lib/format";
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
  Toast,
} from "@/components/ui";

const SIGNAL_LABEL: Record<string, string> = {
  recent: "Recently connected",
  long_standing: "Long-standing",
  dormant: "Older, no recent contact",
  engaged: "Engaged",
  changed_company: "Changed company",
  shared_company: "Shared employer",
  shared_school: "Shared school",
  no_company: "No employer recorded",
};

const INTERACTION_LABEL: Record<string, string> = {
  endorsement: "Endorsed one of your skills",
  recommendation_received: "Wrote you a recommendation",
  recommendation_given: "You wrote them a recommendation",
  invitation: "Connection invitation",
};

export default function PersonPage() {
  const { personId } = useParams<{ personId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  // Which person the tag field was last seeded from. Without this, any
  // background refetch (e.g. after saving a note) would overwrite whatever the
  // user is currently typing.
  const seededFor = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["person", personId],
    queryFn: () => api.person(personId),
    enabled: Boolean(personId),
  });
  const person = data?.data;
  const { data: contextData } = useQuery({
    queryKey: ["person-context", personId],
    queryFn: () => api.personContext(personId),
    enabled: Boolean(personId),
  });
  const context = contextData?.data;

  useEffect(() => {
    if (person && seededFor.current !== person.id) {
      seededFor.current = person.id;
      setTagDraft(person.tags.join(", "));
    }
  }, [person]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["person", personId] });
    void queryClient.invalidateQueries({ queryKey: ["people"] });
    void queryClient.invalidateQueries({ queryKey: ["facets"] });
  };

  const addNote = useMutation({
    mutationFn: (body: string) => api.addNote(personId, body),
    onSuccess: () => {
      setNoteDraft("");
      setToast("Note saved.");
      invalidate();
    },
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: string) => api.deleteNote(noteId),
    onSuccess: () => {
      setNoteToDelete(null);
      setToast("Note deleted.");
      invalidate();
    },
  });

  const saveTags = useMutation({
    mutationFn: (tags: string[]) => api.setTags(personId, tags),
    onSuccess: () => {
      setToast("Tags updated.");
      invalidate();
    },
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Loading…" />
        <SkeletonCard className="h-40" />
        <SkeletonCard className="mt-6 h-64" />
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return (
      <div>
        <PageHeader title={notFound ? "Person not found" : "Could not load this person"} />
        {notFound ? (
          <Alert variant="info" title="That person is not in your network">
            They may have been removed by a data reset, or the link is out of date.{" "}
            <Link href="/people" className="text-accent underline">
              Back to People
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

  if (!person) return null;

  const profileUrl = safeExternalUrl(person.profileUrl);
  const current = person.employment.filter((e) => e.isCurrent);
  const past = person.employment.filter((e) => !e.isCurrent);

  return (
    <div>
      <PageHeader
        title={person.name}
        subtitle={person.headline ?? undefined}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              ← Back
            </Button>
            {profileUrl && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-secondary font-medium text-white hover:bg-accent-hover focus-ring"
              >
                Open on LinkedIn ↗
              </a>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="card-pad">
              <div className="mb-5 flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-h3 text-accent">
                  {initials(person.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-h2 text-ink">{person.name}</p>
                  <p className="text-secondary text-ink-2">
                    {[person.currentTitle, person.currentCompany].filter(Boolean).join(" at ") ||
                      "No role recorded"}
                  </p>
                  {person.signals.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {person.signals.map((s) => (
                        <Badge key={s} tone="neutral">
                          {SIGNAL_LABEL[s] ?? s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <DetailList
                items={[
                  {
                    label: "Connected on",
                    value: person.connectedAt ? formatDate(person.connectedAt) : "Not recorded",
                  },
                  { label: "Location", value: person.location ?? "Not in export" },
                  { label: "Industry", value: person.industry ?? "Not in export" },
                  {
                    label: "Email",
                    value: person.email ? (
                      <a className="text-accent hover:underline" href={`mailto:${person.email}`}>
                        {person.email}
                      </a>
                    ) : (
                      "Not shared"
                    ),
                  },
                  {
                    label: "Last contact",
                    value: person.lastInteractionAt
                      ? relativeTime(person.lastInteractionAt)
                      : "No recorded contact",
                  },
                  {
                    label: "Colleagues in your network",
                    value:
                      person.colleagueCount > 0 ? (
                        <Link
                          className="text-accent hover:underline"
                          href={`/people?company=${encodeURIComponent(person.currentCompany ?? "")}`}
                        >
                          {person.colleagueCount} people
                        </Link>
                      ) : (
                        "None"
                      ),
                  },
                ]}
              />
            </div>
          </Card>

          {context && (
            <Card>
              <CardHeader title="Relationship context score" description={context.disclaimer} />
              <div className="card-pad">
                <p className="text-2xl font-semibold tabular-nums text-ink">{context.score}</p>
                <ul className="mt-3 space-y-2">
                  {context.contributions.map((c) => (
                    <li key={c.key}>
                      <p className="text-body text-ink">
                        +{c.points} {c.label}
                      </p>
                      <p className="text-caption text-ink-3">{c.evidence}</p>
                    </li>
                  ))}
                  {context.contributions.length === 0 && (
                    <li className="text-secondary text-ink-3">
                      No overlapping observable signals with your profile.
                    </li>
                  )}
                </ul>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Experience" description="From your LinkedIn export" />
            {person.employment.length === 0 ? (
              <p className="px-5 py-8 text-center text-secondary text-ink-3">
                No roles recorded for this person.
              </p>
            ) : (
              <ul className="divide-y divide-line/70">
                {[...current, ...past].map((role) => (
                  <li key={role.id} className="flex items-start justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-body text-ink">{role.title ?? "Role not recorded"}</p>
                      <p className="text-secondary text-ink-2">
                        {role.companyId ? (
                          <Link
                            href={`/companies/${role.companyId}`}
                            className="hover:text-accent focus-ring rounded"
                          >
                            {role.companyName}
                          </Link>
                        ) : (
                          (role.companyName ?? "Company not recorded")
                        )}
                      </p>
                      {role.description && <p className="mt-1 text-caption text-ink-3">{role.description}</p>}
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-caption text-ink-3">
                      {role.startDate || role.endDate
                        ? `${role.startDate ?? "?"} – ${role.endDate ?? "present"}`
                        : role.isCurrent
                          ? "Current"
                          : "Former"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {person.education.length > 0 && (
            <Card>
              <CardHeader title="Education" />
              <ul className="divide-y divide-line/70">
                {person.education.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-4 px-5 py-3">
                    <div>
                      <p className="text-body text-ink">{e.schoolName}</p>
                      <p className="text-secondary text-ink-2">
                        {[e.degree, e.fieldOfStudy].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                    <span className="shrink-0 text-caption text-ink-3">
                      {[e.startDate, e.endDate].filter(Boolean).join(" – ") || ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {person.conversations.length > 0 && (
            <Card>
              <CardHeader title="Conversations" description="Message threads from your export" />
              <ul className="divide-y divide-line/70">
                {person.conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/conversations/${c.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-raised/50 focus-ring"
                    >
                      <span className="text-body text-ink">{c.messageCount} messages</span>
                      <span className="text-caption text-ink-3">{relativeTime(c.lastMessageAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Why this person matters" description="Signals calculated from your data" />
            <div className="card-pad space-y-3 text-secondary">
              {person.sharedCompanies.length > 0 && (
                <p className="text-ink-2">
                  <span className="text-ink">Shared employer:</span> {person.sharedCompanies.join(", ")}
                </p>
              )}
              {person.sharedSchools.length > 0 && (
                <p className="text-ink-2">
                  <span className="text-ink">Shared school:</span> {person.sharedSchools.join(", ")}
                </p>
              )}
              {person.interactionCount > 0 ? (
                <p className="text-ink-2">
                  <span className="text-ink">{person.interactionCount}</span> recorded touchpoints, most
                  recently {relativeTime(person.lastInteractionAt)}.
                </p>
              ) : (
                <p className="text-ink-3">No messages or endorsements with this person in your export.</p>
              )}
              {person.interactions.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {person.interactions.slice(0, 5).map((i, idx) => (
                    <li key={`${i.kind}-${idx}`} className="text-ink-2">
                      {INTERACTION_LABEL[i.kind] ?? i.kind}
                      {i.occurredAt && <span className="text-ink-3"> · {formatDate(i.occurredAt)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Tags" description="Your own labels — imports never change them" />
            <div className="card-pad">
              <label htmlFor="tags" className="sr-only">
                Tags, comma separated
              </label>
              <input
                id="tags"
                className="input"
                placeholder="mentor, hiring, alumni"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
              />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  loading={saveTags.isPending}
                  onClick={() =>
                    saveTags.mutate(
                      tagDraft
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                    )
                  }
                >
                  Save tags
                </Button>
                {person.tags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {person.tags.map((t) => (
                      <Badge key={t} tone="accent">
                        {t}
                      </Badge>
                    ))}
                  </span>
                )}
              </div>
              {saveTags.isError && (
                <Alert variant="danger" className="mt-3">
                  {(saveTags.error as Error).message}
                </Alert>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <div className="card-pad">
              <label htmlFor="note" className="sr-only">
                New note
              </label>
              <textarea
                id="note"
                className="input min-h-[5rem] resize-y"
                placeholder="Where you met, what to follow up on…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <Button
                size="sm"
                className="mt-3"
                disabled={noteDraft.trim().length === 0}
                loading={addNote.isPending}
                onClick={() => addNote.mutate(noteDraft.trim())}
              >
                Add note
              </Button>
              {addNote.isError && (
                <Alert variant="danger" className="mt-3">
                  {(addNote.error as Error).message}
                </Alert>
              )}
            </div>
            {person.notes.length > 0 && (
              <ul className="divide-y divide-line/70 border-t border-line">
                {person.notes.map((note) => (
                  <li key={note.id} className="px-5 py-3">
                    <p className="whitespace-pre-wrap text-body text-ink">{note.body}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-caption text-ink-3">{formatDate(note.createdAt)}</span>
                      <button
                        onClick={() => setNoteToDelete(note.id)}
                        className="text-caption text-ink-3 hover:text-danger focus-ring rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Find related people" />
            <div className="card-pad space-y-2">
              {person.currentCompany && (
                <LinkButton
                  href={`/people?company=${encodeURIComponent(person.currentCompany)}`}
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                >
                  Others at {person.currentCompany}
                </LinkButton>
              )}
              {person.currentTitle && (
                <LinkButton
                  href={`/people?title=${encodeURIComponent(person.currentTitle)}`}
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                >
                  Others with a similar title
                </LinkButton>
              )}
              {person.education[0]?.schoolName && (
                <LinkButton
                  href={`/people?school=${encodeURIComponent(person.education[0].schoolName)}`}
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                >
                  Others from {person.education[0].schoolName}
                </LinkButton>
              )}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={noteToDelete !== null}
        title="Delete this note?"
        description="This cannot be undone."
        confirmLabel="Delete note"
        busy={deleteNote.isPending}
        onCancel={() => setNoteToDelete(null)}
        onConfirm={() => noteToDelete && deleteNote.mutate(noteToDelete)}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
