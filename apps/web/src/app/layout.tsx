import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "SpiderWeb — Relationship Intelligence",
  description:
    "Import your LinkedIn data and explore an intelligent map of your professional network.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-bg min-h-screen">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
