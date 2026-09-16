"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Activity() {
  const { data: careerData, isLoading: careerLoading } = useQuery({
    queryKey: ["analytics", "career"],
    queryFn: () => api.getCareerAnalytics(),
  });

  const { data: commData, isLoading: commLoading } = useQuery({
    queryKey: ["analytics", "communication"],
    queryFn: () => api.getCommunicationAnalytics(),
  });

  const { data: networkData } = useQuery({
    queryKey: ["analytics", "network"],
    queryFn: () => api.getNetworkAnalytics(),
  });

  const career = careerData?.data;
  const comm = commData?.data;
  const network = networkData?.data;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Activity</h1>
      
      {/* Activity Timeline */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {careerLoading || commLoading ? (
            <div className="text-gray-400">Loading...</div>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600">📧</span>
                </div>
                <div>
                  <div className="font-medium">Messages</div>
                  <div className="text-sm text-gray-500">
                    Sent {comm?.sentMessages ?? 0} messages, received {comm?.receivedMessages ?? 0}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600">🤝</span>
                </div>
                <div>
                  <div className="font-medium">Connections</div>
                  <div className="text-sm text-gray-500">
                    {network?.totalConnections ?? 0} total connections
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-purple-600">💼</span>
                </div>
                <div>
                  <div className="font-medium">Job Applications</div>
                  <div className="text-sm text-gray-500">
                    {career?.applications ?? 0} applications submitted
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-yellow-600">📊</span>
                </div>
                <div>
                  <div className="font-medium">Data Imports</div>
                  <div className="text-sm text-gray-500">
                    LinkedIn data imported and processed
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Communication Stats</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Messages</span>
              <span className="font-medium">{comm?.totalMessages ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Conversations</span>
              <span className="font-medium">{comm?.conversations ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Unique Contacts</span>
              <span className="font-medium">{comm?.uniqueContacts ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Response Time</span>
              <span className="font-medium">{comm?.avgResponseTime ?? "N/A"}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Job Activity</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Applications</span>
              <span className="font-medium">{career?.applications ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Saved Jobs</span>
              <span className="font-medium">{career?.savedJobs ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Companies Applied To</span>
              <span className="font-medium">{career?.companiesAppliedTo ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Interviews</span>
              <span className="font-medium">{career?.interviews ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
