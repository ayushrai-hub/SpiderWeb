"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_SECTIONS: { heading: string; items: { href: string; label: string }[] }[] = [
  {
    heading: "Overview",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/analytics", label: "Analytics" },
    ],
  },
  {
    heading: "Network",
    items: [
      { href: "/people", label: "People" },
      { href: "/companies", label: "Companies" },
      { href: "/messages", label: "Messages" },
      { href: "/conversations", label: "Conversations" },
    ],
  },
  {
    heading: "Career",
    items: [
      { href: "/jobs", label: "Jobs" },
      { href: "/applications", label: "Applications" },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { href: "/imports", label: "Imports" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {NAV_SECTIONS.map((section) => (
        <div key={section.heading} className="mb-5">
          <p className="px-2.5 mb-1.5 text-label text-ink-3 uppercase">{section.heading}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-2.5 py-1.5 text-body transition-colors focus-ring ${
                      active
                        ? "bg-raised text-ink font-medium"
                        : "text-ink-2 hover:bg-raised/60 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <SpiderMark />
          <div>
            <p className="text-h3 leading-tight text-ink">SpiderWeb</p>
            <p className="text-caption text-ink-3">Relationship intelligence</p>
          </div>
        </div>
        <NavLinks />
        <div className="border-t border-line px-5 py-3">
          <p className="text-caption text-ink-3">Your data stays in your workspace</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <SpiderMark />
          <span className="text-h3 text-ink">SpiderWeb</span>
        </div>
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="rounded-md p-2 text-ink-2 hover:bg-raised focus-ring"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {mobileOpen ? (
              <path d="M6 6l12 12M6 18L18 6" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-overlay pt-14">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <main className="min-w-0 flex-1 pt-14 lg:pl-56 lg:pt-0">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}

function SpiderMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="text-accent">
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.1" opacity="0.3" />
      <path d="M12 2v6.5M12 15.5V22M2 12h6.5M15.5 12H22" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
    </svg>
  );
}
