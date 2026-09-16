"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";

const STATUS_STEPS = [
  { key: "pending", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

function stageLabel(status: string, progress: number): string {
  if (status === "failed") return "Import failed";
  if (status === "completed") return "Import complete";
  if (status === "processing") {
    if (progress < 40) return "Checking archive & extracting...";
    if (progress < 60) return "Classifying files...";
    if (progress < 80) return "Parsing & normalizing...";
    return "Building your network...";
  }
  return "Waiting for a worker...";
}

export default function ImportStatusPage() {
  const params = useParams();
  const importId = params?.importId as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["import", importId],
    queryFn: () => api.getImport(importId),
    enabled: !!importId,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading import...</div>;
  }

  if (error || !data?.data) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 max-w-lg">
          <p className="font-semibold text-red-800">Import not found</p>
          <p className="mt-1 text-sm text-red-600">
            It may belong to another workspace or have been deleted.
          </p>
        </div>
      </div>
    );
  }

  const imp = data.data;
  const files: any[] = imp.files || [];
  const progress = Number(imp.jobStatus?.progress ?? 0);
  const metadata = imp.metadata || {};
  const stats = metadata.stats || {};
  const errorCode = metadata.error_code;
  const isPartial = metadata.partial === true;

  const supported = files.filter((f) => f.file_type === "csv" || f.file_type === "zip");
  const failedFiles = files.filter((f) => f.status === "failed");
  const skipped = metadata.skipped_files ?? 0;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Import status</h1>
      <p className="text-sm text-gray-500 mb-6">
        {imp.source_type} import · {new Date(imp.uploaded_at).toLocaleString()}
      </p>

      {/* Status banner */}
      <div
        className={`rounded-xl border p-6 mb-6 ${
          imp.status === "completed"
            ? "bg-green-50 border-green-200"
            : imp.status === "failed"
              ? "bg-red-50 border-red-200"
              : "bg-blue-50 border-blue-200"
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[imp.status] || "bg-gray-100"}`}>
            {imp.status}
          </span>
          {imp.checksum && (
            <span className="text-xs text-gray-400 font-mono">
              sha256: {String(imp.checksum).slice(0, 12)}…
            </span>
          )}
        </div>

        <p className="mt-3 text-lg font-medium text-gray-900">
          {stageLabel(imp.status, progress)}
        </p>

        {imp.status !== "completed" && imp.status !== "failed" && (
          <div className="mt-4 h-2.5 w-full max-w-md rounded-full bg-white overflow-hidden border border-blue-100">
            <div
              className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: `${Math.max(progress, 5)}%` }}
            />
          </div>
        )}

        {imp.status === "failed" && (
          <div className="mt-3 text-sm text-red-700">
            {errorCode ? (
              <>
                <p className="font-semibold">Reason: {errorCode}</p>
                <p className="mt-1 text-red-600">
                  {errorCode === "INVALID_ARCHIVE" &&
                    "The file wasn't recognized as a valid ZIP archive. Try re-exporting from LinkedIn or uploading the original ZIP."}
                  {errorCode === "EMPTY_ARCHIVE" &&
                    "The archive contains no data. Confirm you downloaded the complete LinkedIn export."}
                  {(errorCode === "EXTRACTION_FAILED" || errorCode === "PROCESSING_FAILED") &&
                    "Something went wrong while processing the archive. You can retry, or re-upload the original ZIP."}
                </p>
              </>
            ) : (
              <p>Processing failed unexpectedly. Try re-uploading your export.</p>
            )}
          </div>
        )}

        {imp.status === "completed" && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "People", value: stats.persons_created ?? 0 },
              { label: "Companies", value: stats.companies_created ?? 0 },
              { label: "Connections", value: stats.connections_created ?? 0 },
              { label: "Messages", value: stats.messages_created ?? 0 },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {isPartial && imp.status === "completed" && (
          <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Import completed with warnings. {files.length - failedFiles.length} file(s) processed
            successfully{failedFiles.length > 0 ? `, ${failedFiles.length} could not be parsed` : ""}
            {skipped > 0 ? `, ${skipped} skipped` : ""}.
          </p>
        )}
      </div>

      {/* Per-file results */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">
            Files ({supported.length} found, {files.length - failedFiles.length} supported,{" "}
            {failedFiles.length} failed, {skipped} skipped)
          </h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Records</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {files.map((f) => {
              const errs: string[] = Array.isArray(f.errors) ? f.errors : [];
              return (
                <tr key={f.id}>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{f.filename}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{f.file_type}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        f.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : f.status === "pending"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-green-100 text-green-800"
                      }`}
                    >
                      {f.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">{f.record_count ?? 0}</td>
                  <td className="px-6 py-3 text-xs text-red-600 max-w-xs truncate">
                    {errs.length > 0 ? errs[0] : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Raw uploaded files are deleted after successful processing. Only normalized data is
        retained. You can delete this import at any time from the imports list.
      </p>
    </div>
  );
}
