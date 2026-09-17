"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardHeader,
  PageHeader,
  Stat,
  SkeletonCard,
  LinkButton,
} from "@/components/ui";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import LinkedInDropZone from "@/components/upload/LinkedInDropZone";

const AXIS = { stroke: "#a8a29e", fontSize: 11 } as const;
const TOOLTIP_STYLE = {
  background: "#fff",
  border: "1px solid #e7e5e4",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 2px 8px -2px rgb(28 25 23 / 0.10)",
} as const;

export default function Dashboard() {
  const { data: profileData, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.getProfile(),
  });

  const profile = profileData?.data;
  const hasData = (profile?.network.connections ?? 0) > 0;

  // Analytics only fetched when data exists — avoids dead requests on fresh accounts
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["profile-analytics"],
    queryFn: () => api.getProfileAnalytics(),
    enabled: hasData,
  });

  const growth = analyticsData?.data?.growth ?? [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          profile?.identity.name
            ? `Welcome back${profile.identity.name ? `, ${profile.identity.name.split(" ")[0]}` : ""}`
            : "Your relationship intelligence overview"
        }
        actions={
          hasData ? (
            <>
              <LinkButton href="/people" variant="secondary" size="sm">Explore people</LinkButton>
              <LinkButton href="/analytics" variant="primary" size="sm">View analytics</LinkButton>
            </>
          ) : undefined
        }
      />

      {isLoading ? (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
          </div>
          <SkeletonCard className="mt-6 h-72" />
        </>
      ) : !hasData ? (
        /* Fresh account: onboarding */
        <>
          <Card className="mb-6">
            <div className="card-pad text-center">
              <h2 className="text-h2 text-ink">Build your network map</h2>
              <p className="mx-auto mt-1.5 max-w-md text-secondary text-ink-2">
                Import your LinkedIn data export and SpiderWeb turns it into an
                intelligent map of your professional network.
              </p>
            </div>
            <div className="border-t border-line p-5">
              <LinkedInDropZone />
            </div>
          </Card>
          <Card>
            <div className="card-pad">
              <p className="text-h3 text-ink">How it works</p>
              <ol className="mt-3 space-y-2 text-secondary text-ink-2">
                <li>1. Request your archive on LinkedIn — Me → Settings &amp; Privacy → Data Privacy → Get a copy of your data. The larger archive may take up to 24 hours to prepare.</li>
                <li>2. Drop the ZIP above, or pick individual files.</li>
                <li>3. SpiderWeb parses, normalizes and maps your relationships.</li>
                <li>4. Explore your network, analytics and profile.</li>
              </ol>
            </div>
          </Card>
        </>
      ) : (
        /* Real dashboard */
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Connections" value={profile?.network.connections ?? 0} />
            <Stat label="Companies" value={profile?.network.companies ?? 0} />
            <Stat label="Messages" value={profile?.network.messages ?? 0} />
            <Stat label="Imports" value={profile?.network.importsCompleted ?? 0} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Network growth" description="New connections per month" />
              <div className="card-pad">
                {analyticsLoading ? (
                  <div className="skeleton h-56" />
                ) : growth.length === 0 ? (
                  <p className="py-16 text-center text-secondary text-ink-3">
                    No connection dates in your import — growth chart unavailable.
                  </p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={growth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0efee" vertical={false} />
                        <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e7e5e4" }} />
                        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          name="New connections"
                          stroke="#0f766e"
                          strokeWidth={2}
                          fill="#0f766e"
                          fillOpacity={0.08}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Continue" />
              <div className="card-pad space-y-2">
                <LinkButton href="/profile" variant="secondary" size="sm" className="w-full justify-start">
                  View your profile
                </LinkButton>
                <LinkButton href="/conversations" variant="secondary" size="sm" className="w-full justify-start">
                  Browse conversations
                </LinkButton>
                <LinkButton href="/companies" variant="secondary" size="sm" className="w-full justify-start">
                  Explore companies
                </LinkButton>
                <LinkButton href="/analytics" variant="ghost" size="sm" className="w-full justify-start">
                  Deeper analytics →
                </LinkButton>
              </div>
            </Card>
          </div>

          {/* Import another archive */}
          <Card className="mt-6">
            <CardHeader
              title="Import more data"
              description="A newer export adds fresh connections and messages"
            />
            <div className="border-t border-line p-5">
              <LinkedInDropZone />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
