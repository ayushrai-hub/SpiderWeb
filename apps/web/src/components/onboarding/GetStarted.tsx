"use client";

import { Card, CardHeader } from "@/components/ui";
import { ImportDropzone } from "@/components/import/ImportDropzone";

const STEPS = [
  {
    title: "Request your archive",
    body: (
      <>
        On LinkedIn go to{" "}
        <strong>Me → Settings &amp; Privacy → Data privacy → Get a copy of your data</strong>. Choose “Want
        something in particular?” and tick at least <strong>Connections</strong>; adding Profile, Positions,
        Education and Messages unlocks more of SpiderWeb.
      </>
    ),
  },
  {
    title: "Wait for the email",
    body: (
      <>
        The small archive usually arrives in about 10 minutes. The complete archive can take up to 24 hours.
      </>
    ),
  },
  {
    title: "Upload it here",
    body: (
      <>
        Drop the ZIP exactly as LinkedIn sent it. SpiderWeb works out which files it can use and ignores the
        rest.
      </>
    ),
  },
  {
    title: "Explore",
    body: (
      <>
        Your dashboard, company views, graph and search fill in as soon as processing finishes — usually
        seconds.
      </>
    ),
  },
];

/** First-run experience: explain the product, then get the data in. */
export function GetStarted() {
  return (
    <>
      <Card className="mb-6">
        <div className="card-pad text-center">
          <h2 className="text-h2 text-ink">
            Turn your LinkedIn export into a network you can actually query
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-secondary text-ink-2">
            SpiderWeb reads the archive LinkedIn gives you, normalises it into people, companies and roles,
            and builds a searchable map of your professional network. Nothing is sent anywhere — it is parsed
            here and stored in your own database.
          </p>
        </div>
        <div className="border-t border-line p-5">
          <ImportDropzone />
        </div>
      </Card>

      <Card>
        <CardHeader title="How to get your LinkedIn export" />
        <ol className="divide-y divide-line/70">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 px-5 py-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-caption font-medium text-accent">
                {i + 1}
              </span>
              <div>
                <p className="text-h3 text-ink">{step.title}</p>
                <p className="mt-0.5 text-secondary text-ink-2">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
