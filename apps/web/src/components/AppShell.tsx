"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GlobalSearch } from "./GlobalSearch";

const NAV_SECTIONS: { heading: string; items: { href: string; label: string }[] }[] = [
  {
    heading: "Overview",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/analytics", label: "Analytics" },
      { href: "/graph", label: "Network graph" },
    ],
  },
  {
    heading: "Network",
    items: [
      { href: "/people", label: "People" },
      { href: "/companies", label: "Companies" },
      { href: "/conversations", label: "Conversations" },
      { href: "/jobs", label: "Jobs" },
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

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
      {NAV_SECTIONS.map((section) => (
        <div key={section.heading} className="mb-5">
          <p className="mb-1.5 px-2.5 text-label uppercase text-ink-3">{section.heading}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-2.5 py-1.5 text-body transition-colors focus-ring ${
                      active
                        ? "bg-raised font-medium text-ink"
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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll behind the mobile drawer.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

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
          <p className="text-caption text-ink-3">Your imported data never leaves this workspace.</p>
        </div>
      </aside>

      <div className="fixed left-0 right-0 top-0 z-40 flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5 lg:left-56 lg:px-10">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="rounded-md p-2 text-ink-2 hover:bg-raised focus-ring lg:hidden"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            {mobileOpen ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <span className="flex items-center gap-2 lg:hidden">
          <SpiderMark />
          <span className="text-h3 text-ink">SpiderWeb</span>
        </span>
        <div className="ml-auto w-full max-w-md">
          <GlobalSearch />
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-overlay">
            <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
              <SpiderMark />
              <p className="text-h3 text-ink">SpiderWeb</p>
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 flex-1 pt-14 lg:pl-56">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}

function SpiderMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-accent">
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.1" opacity="0.3" />
      <path
        d="M12 2v6.5M12 15.5V22M2 12h6.5M15.5 12H22"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.5"
      />
    </svg>
  );
}
