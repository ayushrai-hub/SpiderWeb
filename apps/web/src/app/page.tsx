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
import LinkedInDropZone from "@/components/upload/LinkedInDropZone";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

const SUPPORTED_FILES = [
  "Connections",
  "Messages",
  "Profile information",
  "Positions",
  "Education",
  "Skills",
  "Certifications",
  "Invitations",
  "Comments & Reactions",
  "Job Applications",
  "Company Follows",
  "and other supported LinkedIn export files",
];

export default function Home() {
  const { data: networkData, isLoading: networkLoading } = useQuery({
    queryKey: ["analytics", "network"],
    queryFn: () => api.getNetworkAnalytics(),
  });

  const { data: commData, isLoading: commLoading } = useQuery({
    queryKey: ["analytics", "communication"],
    queryFn: () => api.getCommunicationAnalytics(),
  });

  const network = networkData?.data;
  const comm = commData?.data;

  const hasData = (network?.totalConnections ?? 0) > 0;

  const growthData =
    network?.connectionsOverTime?.map((item: any) => ({
      name: item.month,
      connections: item.count,
    })) || [];

  const industryData =
    network?.industries?.slice(0, 5).map((item: any) => ({
      name: item.name,
      value: item.count,
    })) || [];

  return (
    <div>
      {/* Hero + upload */}
      <section className="mb-10">
        <h1 className="text-3xl font-bold">SpiderWeb</h1>
        <p className="mt-2 text-lg text-gray-600 max-w-2xl">
          Your relationship intelligence layer. Give me your LinkedIn data export and
          I&apos;ll turn it into an intelligent map of your professional network.
        </p>
        <div className="mt-6 bg-white p-6 rounded-lg shadow max-w-2xl">
          <LinkedInDropZone />
        </div>
      </section>

      {/* How it works */}
      <section id="how-to-export" className="mb-10">
        <h2 className="text-xl font-bold mb-4">How it works</h2>
        <ol className="space-y-4 max-w-2xl">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">1</span>
            <div>
              <p className="font-semibold">Download your LinkedIn data</p>
              <p className="text-sm text-gray-600">
                On desktop LinkedIn: <strong>Me → Settings &amp; Privacy → Data Privacy →
                Get a copy of your data</strong>. Pick the larger archive for full network
                analysis. LinkedIn may take up to 24 hours to prepare the larger archive;
                some categories arrive within minutes (usually 5–10 min). The download
                link stays valid for 72 hours.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">2</span>
            <div>
              <p className="font-semibold">Drop the ZIP here</p>
              <p className="text-sm text-gray-600">
                Drag the archive, pick individual files, or select the whole export folder.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">3</span>
            <div>
              <p className="font-semibold">SpiderWeb processes your data</p>
              <p className="text-sm text-gray-600">
                Files are validated, extracted safely, classified, parsed and normalized
                into your network graph. Unsupported files are skipped and reported.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">4</span>
            <div>
              <p className="font-semibold">Explore your network</p>
              <p className="text-sm text-gray-600">
                Ask questions across connections, messages, companies and career history.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* What SpiderWeb can use */}
      <section className="mb-10 max-w-2xl">
        <h2 className="text-xl font-bold mb-4">What SpiderWeb can analyze</h2>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-sm text-gray-600 mb-3">
            SpiderWeb automatically detects supported LinkedIn export files. Files it
            doesn&apos;t recognize are skipped and reported — they never break the import.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {SUPPORTED_FILES.map((f) => (
              <li key={f} className="text-sm text-gray-700 flex items-center gap-2">
                <span className="text-green-600">✓</span> {f}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            LinkedIn export structure can change; detection is filename- and content-based,
            not hard-coded to one layout.
          </p>
        </div>
      </section>

      {/* Privacy */}
      <section className="mb-10 max-w-2xl">
        <h2 className="text-xl font-bold mb-4">Privacy</h2>
        <div className="bg-white rounded-lg shadow p-5 text-sm text-gray-600 space-y-2">
          <p>• Your archive is processed server-side and raw files are deleted after parsing completes.</p>
          <p>• Only normalized data (names, companies, dates, counts) is stored — never the raw ZIP.</p>
          <p>• Message content stays in your workspace database and is never logged.</p>
          <p>• AI features query your structured data with retrieval; your archive is never sent wholesale to third parties.</p>
          <p>• You can permanently delete any import — records and residual files — at any time.</p>
        </div>
      </section>

      {/* Dashboard (only meaningful with data) */}
      {hasData && (
        <>
          <h2 className="text-xl font-bold mb-4">Your network</h2>
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Connection Growth</h3>
              <div className="h-64">
                {growthData.length > 0 ? (
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

            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Top Industries</h3>
              <div className="h-64">
                {industryData.length > 0 ? (
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
          </div>
        </>
      )}
    </div>
  );
}
