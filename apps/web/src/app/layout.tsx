import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Professional Intelligence Platform",
  description: "Upload your professional data. Ask it questions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <Providers>
          <div className="flex">
            {/* Sidebar */}
            <aside className="w-64 bg-gray-900 text-white min-h-screen p-4 hidden lg:block">
              <div className="mb-8">
                <h1 className="text-xl font-bold">Intel Platform</h1>
                <p className="text-xs text-gray-400">Professional Intelligence</p>
              </div>
              
              <nav className="space-y-1">
                <a href="/" className="block px-3 py-2 rounded hover:bg-gray-800">Dashboard</a>
                <a href="/network" className="block px-3 py-2 rounded hover:bg-gray-800">Network</a>
                <a href="/people" className="block px-3 py-2 rounded hover:bg-gray-800">People</a>
                <a href="/companies" className="block px-3 py-2 rounded hover:bg-gray-800">Companies</a>
                <a href="/messages" className="block px-3 py-2 rounded hover:bg-gray-800">Messages</a>
                <a href="/conversations" className="block px-3 py-2 rounded hover:bg-gray-800">Conversations</a>
                <a href="/outreach" className="block px-3 py-2 rounded hover:bg-gray-800">Outreach</a>
                <a href="/jobs" className="block px-3 py-2 rounded hover:bg-gray-800">Jobs</a>
                <a href="/applications" className="block px-3 py-2 rounded hover:bg-gray-800">Applications</a>
                <a href="/activity" className="block px-3 py-2 rounded hover:bg-gray-800">Activity</a>
                <a href="/insights" className="block px-3 py-2 rounded hover:bg-gray-800">Insights</a>
                <a href="/ai" className="block px-3 py-2 rounded hover:bg-gray-800">AI Assistant</a>
                <a href="/imports" className="block px-3 py-2 rounded hover:bg-gray-800">Imports</a>
                <a href="/settings" className="block px-3 py-2 rounded hover:bg-gray-800">Settings</a>
              </nav>
            </aside>

            {/* Mobile header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 bg-gray-900 text-white p-4 z-50">
              <h1 className="text-lg font-bold">Intel Platform</h1>
            </div>

            {/* Main content */}
            <main className="flex-1 p-6 pt-16 lg:pt-6">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
