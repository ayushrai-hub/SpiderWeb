"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Network() {
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ["graph", "overview"],
    queryFn: () => api.getGraphOverview(),
  });

  const { data: networkData, isLoading: networkLoading } = useQuery({
    queryKey: ["analytics", "network"],
    queryFn: () => api.getNetworkAnalytics(),
  });

  const overview = overviewData?.data;
  const network = networkData?.data;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Network</h1>
      
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total Connections</div>
          <div className="text-2xl font-bold">
            {overviewLoading ? "..." : overview?.nodes?.length ?? 0}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Direct Connections</div>
          <div className="text-2xl font-bold">
            {overviewLoading ? "..." : overview?.directConnections ?? 0}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Clusters</div>
          <div className="text-2xl font-bold">
            {overviewLoading ? "..." : overview?.clusters?.length ?? 0}
          </div>
        </div>
      </div>

      {/* Network Graph Placeholder */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Network Graph</h2>
        <div className="h-96 bg-gray-50 rounded-lg flex items-center justify-center">
          {overviewLoading ? (
            <div className="text-gray-400">Loading network...</div>
          ) : (
            <div className="text-center">
              <div className="text-6xl mb-4">🕸️</div>
              <div className="text-gray-500">Interactive network visualization</div>
              <div className="text-sm text-gray-400 mt-2">
                {overview?.nodes?.length ?? 0} nodes, {overview?.edges?.length ?? 0} connections
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Connections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Top Industries</h2>
          <div className="space-y-2">
            {networkLoading ? (
              <div className="text-gray-400">Loading...</div>
            ) : network?.industries?.length > 0 ? (
              network.industries.slice(0, 5).map((item: any) => (
                <div key={item.name} className="flex items-center">
                  <span className="w-32 text-sm text-gray-600 truncate">{item.name}</span>
                  <div className="flex-1 bg-gray-100 rounded h-4">
                    <div
                      className="bg-blue-500 h-4 rounded"
                      style={{
                        width: `${Math.min(100, (item.count / Math.max(...network.industries.map((i: any) => i.count))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm">{item.count}</span>
                </div>
              ))
            ) : (
              <div className="text-gray-400">No data yet</div>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Top Locations</h2>
          <div className="space-y-2">
            {networkLoading ? (
              <div className="text-gray-400">Loading...</div>
            ) : network?.locations?.length > 0 ? (
              network.locations.slice(0, 5).map((item: any) => (
                <div key={item.name} className="flex items-center">
                  <span className="w-32 text-sm text-gray-600 truncate">{item.name}</span>
                  <div className="flex-1 bg-gray-100 rounded h-4">
                    <div
                      className="bg-green-500 h-4 rounded"
                      style={{
                        width: `${Math.min(100, (item.count / Math.max(...network.locations.map((i: any) => i.count))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm">{item.count}</span>
                </div>
              ))
            ) : (
              <div className="text-gray-400">No data yet</div>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Connection Strength</h2>
          <div className="space-y-2">
            {networkLoading ? (
              <div className="text-gray-400">Loading...</div>
            ) : network?.connectionStrength?.length > 0 ? (
              network.connectionStrength.slice(0, 5).map((item: any) => (
                <div key={item.label} className="flex items-center">
                  <span className="w-32 text-sm text-gray-600">{item.label}</span>
                  <div className="flex-1 bg-gray-100 rounded h-4">
                    <div
                      className="bg-purple-500 h-4 rounded"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm">{item.count}</span>
                </div>
              ))
            ) : (
              <div className="text-gray-400">No data yet</div>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Growth Timeline</h2>
          <div className="space-y-2">
            {networkLoading ? (
              <div className="text-gray-400">Loading...</div>
            ) : network?.connectionsOverTime?.length > 0 ? (
              network.connectionsOverTime.slice(-6).map((item: any) => (
                <div key={item.month} className="flex items-center">
                  <span className="w-20 text-sm text-gray-600">{item.month}</span>
                  <div className="flex-1 bg-gray-100 rounded h-4">
                    <div
                      className="bg-orange-500 h-4 rounded"
                      style={{
                        width: `${Math.min(100, (item.count / Math.max(...network.connectionsOverTime.map((i: any) => i.count))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm">{item.count}</span>
                </div>
              ))
            ) : (
              <div className="text-gray-400">No data yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
