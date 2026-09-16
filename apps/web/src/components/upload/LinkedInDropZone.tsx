"use client";

import { useCallback, useRef, useState, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadImportWithProgress } from "@/lib/api";

export type DropZoneState =
  | "idle"
  | "dragging"
  | "uploading"
  | "processing"
  | "success"
  | "error";

interface PendingFile {
  file: File;
  valid: boolean;
  reason?: string;
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB — matches server limit
const ALLOWED_EXT = [".zip", ".csv", ".json"];
const LINKEDIN_CSV_HINT =
  /connection|message|profile|position|education|skill|certification|project|language|invitation|note|comment|reaction|share|repost|job|follow|event|ad|registration|license|honor|volunteer|email|phone|group|endorsement|recommendation/i;

function validateFile(file: File): { valid: boolean; reason?: string } {
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf("."));

  if (file.size === 0) return { valid: false, reason: "File is empty" };
  if (file.size > MAX_FILE_SIZE)
    return {
      valid: false,
      reason: `File exceeds ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB limit`,
    };
  if (!ALLOWED_EXT.includes(ext))
    return { valid: false, reason: `Unsupported type "${ext || "unknown"}" — use ZIP, CSV or JSON` };
  if (ext === ".csv" && !LINKEDIN_CSV_HINT.test(file.name))
    return { valid: false, reason: `Not a recognized LinkedIn export file` };
  return { valid: true };
}

export default function LinkedInDropZone() {
  const router = useRouter();
  const [state, setState] = useState<DropZoneState>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [folderSupported, setFolderSupported] = useState(true);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);



  const collectFromDataTransfer = async (dt: DataTransfer): Promise<File[]> => {
    const out: File[] = [];
    const items = dt.items ? Array.from(dt.items) : [];

    const walkEntry = (entry: any): Promise<void> =>
      new Promise((resolve) => {
        if (!entry) return resolve();
        if (entry.isFile) {
          entry.file((f: File) => {
            out.push(f);
            resolve();
          }, () => resolve());
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          const readAll = () =>
            reader.readEntries(async (entries: any[]) => {
              if (entries.length === 0) return resolve();
              await Promise.all(entries.map(walkEntry));
              readAll(); // readEntries returns ≤100 per call
            }, () => resolve());
          readAll();
        } else resolve();
      });

    const entries = items
      .filter((i) => i.kind === "file")
      .map((i) => (i as any).webkitGetAsEntry?.());

    if (entries.some(Boolean)) {
      await Promise.all(entries.map(walkEntry));
    } else {
      out.push(...Array.from(dt.files));
    }
    return out;
  };

  const startUpload = useCallback(
    async (files: File[]) => {
      const checked = files.map((f) => ({ file: f, ...validateFile(f) }));
      const valid = checked.filter((c) => c.valid);
      setPending(checked);

      if (valid.length === 0) {
        setState("error");
        setError(checked[0]?.reason || "No valid files provided");
        return;
      }

      setState("uploading");
      setProgress(0);
      setError(null);
      setStatusMessage(`Uploading ${valid.length} file${valid.length > 1 ? "s" : ""}...`);

      try {
        const result = await uploadImportWithProgress(valid.map((v) => v.file), (pct) => {
          setProgress(pct);
        });
        setState("processing");
        setStatusMessage("Checking archive and classifying files...");
        // Router refresh picks up import in list; status page polls importId
        router.push(`/imports/${result.data.importId}`);
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [router]
  );

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(0);
    if (state === "uploading" || state === "processing") return;

    const files = await collectFromDataTransfer(e.dataTransfer);
    if (files.length === 0) {
      setState("error");
      setError("Nothing droppable found. Try dragging files or a folder.");
      return;
    }
    await startUpload(files);
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setDragDepth((d) => d + 1);
      setState((s) => (s === "idle" || s === "error" || s === "success" ? "dragging" : s));
    }
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragDepth((d) => {
      const next = d - 1;
      if (next <= 0) {
        setDragDepth(0);
        setState((s) => (s === "dragging" ? "idle" : s));
      }
      return next;
    });
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => e.preventDefault();

  const onFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length > 0) startUpload(files);
  };

  const onFolderSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    if ((e.target as any).webkitdirectory && files.length === 0) {
      setFolderSupported(false);
    }
    startUpload(files);
  };

  const busy = state === "uploading" || state === "processing";

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload LinkedIn data export"
        aria-disabled={busy}
        onDrop={onDrop}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onClick={() => !busy && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) fileInputRef.current?.click();
        }}
        className={`
          relative rounded-xl border-2 border-dashed p-10 text-center transition-all cursor-pointer
          ${state === "dragging" ? "border-blue-500 bg-blue-50 scale-[1.01]" : ""}
          ${state === "error" ? "border-red-400 bg-red-50" : ""}
          ${state === "success" ? "border-green-400 bg-green-50" : ""}
          ${state === "idle" ? "border-gray-300 hover:border-blue-400 hover:bg-gray-50" : ""}
          ${busy ? "border-blue-300 bg-blue-50/50 cursor-wait" : ""}
        `}
      >
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={onFileSelect}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".zip,.csv,.json"
          className="hidden"
          onChange={onFileSelect}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          {...({ webkitdirectory: "", directory: "" } as any)}
          onChange={onFolderSelect}
        />

        {state === "idle" && (
          <>
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mt-3 text-base font-medium text-gray-900">
              Drop your LinkedIn export here
            </p>
            <p className="mt-1 text-sm text-gray-500">or</p>
            <p className="mt-1 text-sm text-blue-600 font-medium">Choose files</p>
            <p className="mt-3 text-xs text-gray-400">
              ZIP, CSV, JSON and supported LinkedIn export files
            </p>
          </>
        )}

        {state === "dragging" && (
          <p className="text-lg font-semibold text-blue-600">Release to upload</p>
        )}

        {(state === "uploading" || state === "processing") && (
          <div>
            <p className="text-sm font-medium text-gray-900">{statusMessage}</p>
            <div className="mx-auto mt-4 h-2.5 w-full max-w-sm rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${state === "processing" ? 100 : progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {state === "processing"
                ? "Extracting, classifying and parsing your data. You can safely leave this page."
                : `${progress}%`}
            </p>
          </div>
        )}

        {state === "error" && (
          <div>
            <p className="text-sm font-semibold text-red-700">Upload problem</p>
            <p className="mt-2 text-sm text-red-600">{error}</p>
            <p className="mt-3 text-xs text-gray-500">Click to try again</p>
          </div>
        )}

        {state === "success" && (
          <p className="text-sm font-medium text-green-700">Import queued successfully</p>
        )}
      </div>

      {/* Rejected files report */}
      {pending.some((p) => !p.valid) && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-semibold text-amber-800">
            {pending.filter((p) => !p.valid).length} file(s) skipped:
          </p>
          <ul className="mt-1 space-y-0.5">
            {pending
              .filter((p) => !p.valid)
              .slice(0, 5)
              .map((p, i) => (
                <li key={i} className="text-xs text-amber-700 truncate">
                  {p.file.name} — {p.reason}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            zipInputRef.current?.click();
          }}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Upload LinkedIn data
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            folderInputRef.current?.click();
          }}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Upload folder
        </button>
        <a
          href="#how-to-export"
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          How to download your LinkedIn data
        </a>
      </div>

      {!folderSupported && (
        <p className="mt-2 text-center text-xs text-amber-600">
          Folder upload isn&apos;t supported here. Upload your LinkedIn ZIP instead.
        </p>
      )}
    </div>
  );
}
