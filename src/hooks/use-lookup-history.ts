import { useCallback, useState } from 'react';

type Entry<T> = { query: string; data: T; savedAt: number };

const MAX_ENTRIES = 10;

function readEntries<T>(key: string): Entry<T>[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter(
        (item) => typeof item?.query === 'string' && item.data && Number.isFinite(item.savedAt)
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

const sameQuery = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function useLookupHistory<T>(key: string) {
  const [entries, setEntries] = useState<Entry<T>[]>(() => readEntries<T>(key));

  const save = useCallback(
    (query: string, data: T) => {
      setEntries((previous) => {
        const next = [
          { query, data, savedAt: Date.now() },
          ...previous.filter((entry) => !sameQuery(entry.query, query)),
        ].slice(0, MAX_ENTRIES);
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* Storage may be unavailable or full. Keep this session usable. */
        }
        return next;
      });
    },
    [key]
  );

  return {
    entries,
    save,
    find: (query: string) => entries.find((entry) => sameQuery(entry.query, query)),
  };
}
