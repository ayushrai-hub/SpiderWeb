"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Outreach() {
  const { data: outreachData, isLoading: outreachLoading } = useQuery({
    queryKey: ["analytics", "outreach"],
    queryFn: () => api.getOutreachAnalytics(),
  });

  const outreach = outreachData?.data;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Outreach</h1>
      
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total Outreach</div>
          <div className="text-2xl font-bold">
            {outreachLoading ? "..." : outreach?.totalOutreach ?? 0}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Response Rate</div>
          <div className="text-2xl font-bold">
            {outreachLoading ? "..." : `${outreach?.responseRate ?? 0}%`}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Meeting Conversion</div>
          <div className="text-2xl font-bold">
            {outreachLoading ? "..." : `${outreach?.meetingConversion ?? 0}%`}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Average Response Time</div>
          <div className="text-2xl font-bold">
            {outreachLoading ? "..." : outreach?.avgResponseTime ?? "N/A"}
          </div>
        </div>
      </div>

      {/* Outreach Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Outreach by Channel</h2>
          <div className="space-y-3">
            {outreachLoading ? (
              <div className="text-gray-400">Loading...</div>
            ) : outreach?.byChannel?.length > 0 ? (
              outreach.byChannel.map((item: any) => (
                <div key={item.channel} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 capitalize">{item.channel}</span>
                  <div className="flex items-center gap-4">
                    <div className="w-32 bg-gray-100 rounded h-4">
                      <div
                        className="bg-blue-500 h-4 rounded"
                        style={{
                          width: `${Math.min(100, (item.count / Math.max(...outreach.byChannel.map((i: any) => i.count))) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-400">No outreach data yet</div>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Outreach Results</h2>
          <div className="space-y-3">
            {outreachLoading ? (
              <div className="text-gray-400">Loading...</div>
            ) : outreach?.byResult?.length > 0 ? (
              outreach.byResult.map((item: any) => (
                <div key={item.result} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{item.result}</span>
                  <div className="flex items-center gap-4">
                    <div className="w-32 bg-gray-100 rounded h-4">
                      <div
                        className={`h-4 rounded ${
                          item.result === 'connected' ? 'bg-green-500' :
                          item.result === 'responded' ? 'bg-blue-500' :
                          item.result === 'meeting' ? 'bg-purple-500' :
                          'bg-gray-400'
                        }`}
                        style={{
                          width: `${Math.min(100, (item.count / Math.max(...outreach.byResult.map((i: any) => i.count))) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-400">No results yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Outreach */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Recent Outreach</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {outreachLoading ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500">Loading...</td></tr>
            ) : outreach?.recentOutreach?.length > 0 ? (
              outreach.recentOutreach.map((item: any) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{item.contactName}</div>
                    <div className="text-sm text-gray-500">{item.contactCompany}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{item.channel}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      item.result === 'connected' ? 'bg-green-100 text-green-800' :
                      item.result === 'responded' ? 'bg-blue-100 text-blue-800' :
                      item.result === 'meeting' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {item.result}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(item.sentAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500">No outreach yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
