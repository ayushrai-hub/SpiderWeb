"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

export default function Dashboard() {
  const { data: networkData, isLoading: networkLoading } = useQuery({
    queryKey: ["analytics", "network"],
    queryFn: () => api.getNetworkAnalytics(),
  });

  const { data: commData, isLoading: commLoading } = useQuery({
    queryKey: ["analytics", "communication"],
    queryFn: () => api.getCommunicationAnalytics(),
  });

  const { data: careerData, isLoading: careerLoading } = useQuery({
    queryKey: ["analytics", "career"],
    queryFn: () => api.getCareerAnalytics(),
  });

  const network = networkData?.data;
  const comm = commData?.data;
  const career = careerData?.data;

  const growthData = network?.connectionsOverTime?.map((item: any) => ({
    name: item.month,
    connections: item.count,
  })) || [];

  const industryData = network?.industries?.slice(0, 5).map((item: any) => ({
    name: item.name,
    value: item.count,
  })) || [];

  const messageData = [
    { name: "Sent", value: comm?.sentMessages || 0 },
    { name: "Received", value: comm?.receivedMessages || 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total Connections</div>
          <div className="text-2xl font-bold">
            {networkLoading ? "..." : network?.totalConnections ?? 0}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Companies</div>
          <div className="text-2xl font-bold">
            {networkLoading ? "..." : network?.companiesRepresented ?? 0}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Messages</div>
          <div className="text-2xl font-bold">
            {commLoading ? "..." : comm?.totalMessages ?? 0}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Applications</div>
          <div className="text-2xl font-bold">
            {careerLoading ? "..." : career?.applications ?? 0}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Growth Chart */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Connection Growth</h2>
          <div className="h-64">
            {networkLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
            ) : growthData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="connections" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">No data yet</div>
            )}
          </div>
        </div>

        {/* Industry Distribution */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Top Industries</h2>
          <div className="h-64">
            {networkLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
            ) : industryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={industryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {industryData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">No data yet</div>
            )}
          </div>
        </div>

        {/* Message Activity */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Message Activity</h2>
          <div className="h-64">
            {commLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={messageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Career Stats */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Career</h2>
          <div className="h-64">
            {careerLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Applications", value: career?.applications || 0 },
                    { name: "Saved", value: career?.savedJobs || 0 },
                    { name: "Interviews", value: career?.interviews || 0 },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#ffc658" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
