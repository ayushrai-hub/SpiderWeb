"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Insights() {
  const { data: contentData } = useQuery({
    queryKey: ["analytics", "content"],
    queryFn: () => api.getContentAnalytics(),
  });

  const { data: relationshipData, isLoading: relationshipLoading } = useQuery({
    queryKey: ["analytics", "relationships"],
    queryFn: () => api.getRelationshipAnalytics(),
  });

  const { data: dataQualityData } = useQuery({
    queryKey: ["analytics", "data-quality"],
    queryFn: () => api.getDataQualityAnalytics(),
  });

  const content = contentData?.data;
  const relationships = relationshipData?.data;
  const dataQuality = dataQualityData?.data;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Insights</h1>
      
      {/* Content Insights */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Content Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-blue-500">{content?.totalPosts ?? 0}</div>
            <div className="text-sm text-gray-500">Total Posts</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-green-500">{content?.totalEngagement ?? 0}</div>
            <div className="text-sm text-gray-500">Total Engagement</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-purple-500">{content?.avgEngagement ?? 0}</div>
            <div className="text-sm text-gray-500">Avg Engagement</div>
          </div>
        </div>
      </div>

      {/* Relationship Insights */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Relationship Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium mb-3">Strongest Connections</h3>
            <div className="space-y-2">
              {relationshipLoading ? (
                <div className="text-gray-400">Loading...</div>
              ) : relationships?.strongestConnections?.length > 0 ? (
                relationships.strongestConnections.slice(0, 5).map((conn: any) => (
                  <div key={conn.personId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div>
                      <div className="font-medium">{conn.name}</div>
                      <div className="text-sm text-gray-500">{conn.company}</div>
                    </div>
                    <div className="text-sm font-medium text-green-600">{conn.strength}</div>
                  </div>
                ))
              ) : (
                <div className="text-gray-400">No data yet</div>
              )}
            </div>
          </div>
          <div>
            <h3 className="font-medium mb-3">Relationship Distribution</h3>
            <div className="space-y-2">
              {relationshipLoading ? (
                <div className="text-gray-400">Loading...</div>
              ) : relationships?.distribution?.length > 0 ? (
                relationships.distribution.map((dist: any) => (
                  <div key={dist.type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{dist.type}</span>
                    <div className="flex items-center gap-4">
                      <div className="w-32 bg-gray-100 rounded h-4">
                        <div
                          className="bg-blue-500 h-4 rounded"
                          style={{
                            width: `${Math.min(100, (dist.count / Math.max(...relationships.distribution.map((d: any) => d.count))) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{dist.count}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-gray-400">No data yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Data Quality */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Data Quality</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-green-500">{dataQuality?.completeness ?? 0}%</div>
            <div className="text-sm text-gray-500">Completeness</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-blue-500">{dataQuality?.accuracy ?? 0}%</div>
            <div className="text-sm text-gray-500">Accuracy</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-purple-500">{dataQuality?.freshness ?? 0}%</div>
            <div className="text-sm text-gray-500">Freshness</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-orange-500">{dataQuality?.duplicates ?? 0}</div>
            <div className="text-sm text-gray-500">Duplicates Found</div>
          </div>
        </div>
      </div>
    </div>
  );
}
