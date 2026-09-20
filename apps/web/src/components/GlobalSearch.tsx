"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SearchHit } from "@/lib/types";

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  person: "Person",
  company: "Company",
  conversation: "Conversation",
};

function hrefFor(hit: SearchHit): string {
  if (hit.type === "person") return `/people/${hit.id}`;
  if (hit.type === "company") return `/companies/${hit.id}`;
  return `/conversations/${hit.id}`;
}

/**
 * Search runs server-side against indexed columns — the browser never holds
 * the network in memory, so this stays fast on large imports.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(input.trim()), 200);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["search", term],
    queryFn: () => api.search(term),
    enabled: term.length >= 2,
    staleTime: 30_000,
  });

  const hits = useMemo(() => data?.data ?? [], [data]);

  useEffect(() => {
    setHighlight(0);
  }, [hits]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setInput("");
    router.push(hrefFor(hit));
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor="global-search" className="sr-only">
        Search your network
      </label>
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        role="combobox"
        aria-expanded={open && term.length >= 2}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        placeholder="Search people, companies, conversations…  ⌘K"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && hits[highlight]) {
            e.preventDefault();
            go(hits[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="input h-9 py-1.5"
      />

      {open && term.length >= 2 && (
        <div
          id="global-search-results"
          role="listbox"
          className="card absolute right-0 top-full z-50 mt-1.5 max-h-96 w-full overflow-y-auto shadow-overlay"
        >
          {isFetching && hits.length === 0 ? (
            <p className="px-4 py-3 text-secondary text-ink-3">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-3 text-secondary text-ink-3">Nothing matches “{term}”.</p>
          ) : (
            <ul className="divide-y divide-line/70">
              {hits.map((hit, i) => (
                <li key={`${hit.type}-${hit.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left focus-ring ${
                      i === highlight ? "bg-raised" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body text-ink">{hit.title}</span>
                      {hit.subtitle && (
                        <span className="block truncate text-caption text-ink-3">{hit.subtitle}</span>
                      )}
                    </span>
                    <span className="badge badge-neutral shrink-0">{TYPE_LABEL[hit.type]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
