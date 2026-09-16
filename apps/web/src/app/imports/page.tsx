"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import LinkedInDropZone from "@/components/upload/LinkedInDropZone";
import { useState } from "react";

export default function Imports() {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["imports"],
    queryFn: () => api.getImports(),
    refetchInterval: (query) => {
      const rows: any[] = query.state.data?.data || [];
      const active = rows.some((r) => r.status === "pending" || r.status === "processing");
      return active ? 3000 : false;
    },
  });

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/v1/imports/${id}`, {
        method: "DELETE",
        headers: {
          ...(localStorage.getItem("token") && { Authorization: `Bearer ${localStorage.getItem("token")}` }),
          ...(localStorage.getItem("workspaceId") && { "X-Workspace-Id": localStorage.getItem("workspaceId")! }),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["imports"] });
    } finally {
      setDeleting(null);
    }
  };

  const imports = data?.data || [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Imports</h1>

      {/* Upload area */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <LinkedInDropZone />
      </div>

      {/* Imports list */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Import History</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Files</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Records</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Loading...</td>
              </tr>
            ) : imports.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No imports yet. Drop your LinkedIn export above to get started.
                </td>
              </tr>
            ) : (
              imports.map((imp: any) => (
                <tr key={imp.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <a href={`/imports/${imp.id}`} className="text-blue-600 hover:underline">
                      {imp.source_type}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{imp.file_count ?? 0}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{imp.total_records ?? 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      imp.status === "completed" ? "bg-green-100 text-green-800" :
                      imp.status === "failed" ? "bg-red-100 text-red-800" :
                      imp.status === "processing" ? "bg-blue-100 text-blue-800" :
                      "bg-yellow-100 text-yellow-800"
                    }`}>
                      {imp.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(imp.uploaded_at || imp.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(imp.id)}
                      disabled={deleting === imp.id}
                      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {deleting === imp.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
