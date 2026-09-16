"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"listings" | "applications" | "saved">("listings");

  const { data: listingsData, isLoading: listingsLoading } = useQuery({
    queryKey: ["jobs", "listings", search, page],
    queryFn: () => api.getJobs({ search, page: String(page), limit: "20" }),
    enabled: tab === "listings",
  });

  const { data: applicationsData, isLoading: applicationsLoading } = useQuery({
    queryKey: ["jobs", "applications"],
    queryFn: () => api.getJobApplications(),
    enabled: tab === "applications",
  });

  const { data: savedData, isLoading: savedLoading } = useQuery({
    queryKey: ["jobs", "saved"],
    queryFn: () => api.getSavedJobs(),
    enabled: tab === "saved",
  });

  const jobs = tab === "listings" ? listingsData?.data || [] : tab === "applications" ? applicationsData?.data || [] : savedData?.data || [];
  const pagination = tab === "listings" ? listingsData?.pagination : null;
  const isLoading = tab === "listings" ? listingsLoading : tab === "applications" ? applicationsLoading : savedLoading;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Jobs</h1>
      
      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setTab("listings")}
          className={`px-4 py-2 rounded-lg ${tab === "listings" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          Job Listings
        </button>
        <button
          onClick={() => setTab("applications")}
          className={`px-4 py-2 rounded-lg ${tab === "applications" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          My Applications
        </button>
        <button
          onClick={() => setTab("saved")}
          className={`px-4 py-2 rounded-lg ${tab === "saved" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
        >
          Saved Jobs
        </button>
      </div>

      {tab === "listings" && (
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="flex-1 border rounded-lg px-4 py-2"
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">Loading...</td></tr>
            ) : jobs.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No jobs found</td></tr>
            ) : (
              jobs.map((job: any) => (
                <tr key={job.id} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{job.title}</div>
                    <div className="text-sm text-gray-500 truncate max-w-md">{job.description?.slice(0, 100)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{job.companyName || job.company}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{job.location}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      job.status === 'applied' ? 'bg-green-100 text-green-800' :
                      job.status === 'saved' ? 'bg-blue-100 text-blue-800' :
                      job.status === 'interviewing' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {job.status || "new"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(job.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        {pagination && pagination.totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, pagination.total)} of {pagination.total}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
