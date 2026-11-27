"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

// Recently opened recipes, kept in this browser only (localStorage), newest first.
type Recent = { id: string; title: string };
const KEY = "recent-recipes";
const MAX = 6;
const listeners = new Set<() => void>();
let cache: { raw: string | null; list: Recent[] } = { raw: null, list: [] };

function read(): Recent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== cache.raw) cache = { raw, list: raw ? (JSON.parse(raw) as Recent[]) : [] };
  } catch {
    // Storage blocked or broken: just show nothing.
  }
  return cache.list;
}

/** Remembers that a recipe was opened. Put it on the recipe page. */
export function RecordRecentView({ id, title }: Recent) {
  useEffect(() => {
    try {
      const list = [{ id, title }, ...read().filter((r) => r.id !== id)].slice(0, MAX);
      localStorage.setItem(KEY, JSON.stringify(list));
      listeners.forEach((l) => l());
    } catch {
      // Not important enough to report.
    }
  }, [id, title]);
  return null;
}

/** "Zuletzt angesehen" on the start page. */
export function RecentRecipes() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => [] as Recent[],
  );
  if (list.length === 0) return null;
  return (
    <section>
      <h2>Zuletzt angesehen</h2>
      <ul className="plain-list">
        {list.map((r) => (
          <li key={r.id}>
            <Link href={`/recipes/${r.id}`}>{r.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
