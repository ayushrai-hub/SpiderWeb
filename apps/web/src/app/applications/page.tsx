"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Applications() {
  const { data, isLoading } = useQuery({
    queryKey: ["jobs", "applications"],
    queryFn: () => api.getJobApplications(),
  });

  const applications = data?.data || [];

  const stats = {
    total: applications.length,
    applied: applications.filter((a: any) => a.status === "applied").length,
    interviewing: applications.filter((a: any) => a.status === "interviewing").length,
    offered: applications.filter((a: any) => a.status === "offered").length,
    rejected: applications.filter((a: any) => a.status === "rejected").length,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Job Applications</h1>
      
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Applied</div>
          <div className="text-2xl font-bold text-blue-500">{stats.applied}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Interviewing</div>
          <div className="text-2xl font-bold text-yellow-500">{stats.interviewing}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Offered</div>
          <div className="text-2xl font-bold text-green-500">{stats.offered}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Rejected</div>
          <div className="text-2xl font-bold text-red-500">{stats.rejected}</div>
        </div>
      </div>

      {/* Applications table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applied Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">Loading...</td></tr>
            ) : applications.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No applications yet</td></tr>
            ) : (
              applications.map((app: any) => (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{app.jobTitle}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{app.companyName}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      app.status === 'applied' ? 'bg-blue-100 text-blue-800' :
                      app.status === 'interviewing' ? 'bg-yellow-100 text-yellow-800' :
                      app.status === 'offered' ? 'bg-green-100 text-green-800' :
                      app.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(app.appliedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(app.updatedAt).toLocaleDateString()}
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
