import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "SpiderWeb — Relationship intelligence",
  description: "Turn your LinkedIn export into a searchable, structured map of your professional network.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
