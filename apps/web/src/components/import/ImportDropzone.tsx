"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ApiRequestError, uploadImport, type UploadHandle } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { Alert, Button } from "@/components/ui";

const ACCEPT = ".zip,.csv,.tsv,.txt";
const MAX_FILE_BYTES = 500 * 1024 * 1024;

type Phase = "idle" | "uploading" | "queued" | "error";

interface Rejected {
  filename: string;
  reason: string;
}

/**
 * Drag-and-drop or pick a LinkedIn export. Accepts the ZIP LinkedIn emails
 * you, or individual CSVs for people who only kept part of the archive.
 */
export function ImportDropzone({ onStarted }: { onStarted?: (importId: string) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<UploadHandle | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);

  const start = useCallback(
    async (files: File[]) => {
      setError(null);
      setRejected([]);
      setDuplicateOf(null);

      const oversize = files.find((f) => f.size > MAX_FILE_BYTES);
      if (oversize) {
        setPhase("error");
        setError(`${oversize.name} is ${formatBytes(oversize.size)}. The limit is 500 MB per file.`);
        return;
      }
      const empty = files.every((f) => f.size === 0);
      if (empty) {
        setPhase("error");
        setError("That file is empty. Download your export again from LinkedIn.");
        return;
      }

      setPhase("uploading");
      setProgress(0);
      const handle = uploadImport(files, setProgress);
      handleRef.current = handle;

      try {
        const result = await handle.promise;
        setRejected(result.data.rejected ?? []);
        setDuplicateOf(result.data.previouslyImportedAt);
        setPhase("queued");
        await queryClient.invalidateQueries({ queryKey: ["imports"] });
        onStarted?.(result.data.importId);
        router.push(`/imports/${result.data.importId}`);
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === "UPLOAD_CANCELLED") {
          setPhase("idle");
          setProgress(0);
          return;
        }
        setPhase("error");
        setError(err instanceof Error ? err.message : "The upload failed. Try again.");
      } finally {
        handleRef.current = null;
      }
    },
    [onStarted, queryClient, router]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void start(files);
  };

  const busy = phase === "uploading";

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-raised/40"
        }`}
      >
        <p className="text-h3 text-ink">Drop your LinkedIn export here</p>
        <p className="mx-auto mt-1 max-w-sm text-secondary text-ink-2">
          The <code className="rounded bg-raised px-1">.zip</code> LinkedIn emails you, or individual CSV
          files such as Connections.csv.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) void start(files);
          }}
        />

        <div className="mt-4 flex items-center justify-center gap-2">
          <Button onClick={() => inputRef.current?.click()} disabled={busy} size="sm">
            Choose files
          </Button>
          {busy && (
            <Button variant="secondary" size="sm" onClick={() => handleRef.current?.cancel()}>
              Cancel
            </Button>
          )}
        </div>

        {busy && (
          <div className="mx-auto mt-5 max-w-sm">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-caption text-ink-3">Uploading… {progress}%</p>
          </div>
        )}
      </div>

      {phase === "error" && error && (
        <Alert variant="danger" className="mt-4" title="Upload failed">
          {error}
        </Alert>
      )}

      {duplicateOf && (
        <Alert variant="info" className="mt-4" title="You have imported this file before">
          SpiderWeb will update existing records instead of creating duplicates.
        </Alert>
      )}

      {rejected.length > 0 && (
        <Alert variant="warning" className="mt-4" title={`${rejected.length} file(s) were not accepted`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {rejected.slice(0, 5).map((r) => (
              <li key={r.filename}>
                <span className="font-medium">{r.filename}</span> — {r.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}

export default ImportDropzone;
