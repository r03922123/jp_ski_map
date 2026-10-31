/**
 * A validated localStorage document as an external store for `useSyncExternalStore`
 * (the pattern saved-places uses): every read is validated; a corrupt value starts
 * empty and is kept under `corruptKey`; writes go to memory first, so blocked storage
 * (private mode) still works for the session; other tabs' changes arrive by `storage`.
 */
export function createLocalStore<T>({
  key,
  corruptKey,
  parse,
  empty,
}: {
  key: string;
  corruptKey: string;
  parse: (raw: unknown) => T | null;
  empty: () => T;
}) {
  let state: T | null = null;
  const serverSnapshot = empty();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };

  function read(): T {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return empty(); // storage blocked
    }
    if (raw === null) return empty();
    let parsed: T | null = null;
    try {
      parsed = parse(JSON.parse(raw));
    } catch {
      parsed = null;
    }
    if (parsed) return parsed;
    try {
      localStorage.setItem(corruptKey, raw); // keep it for a manual rescue
    } catch {
      // nothing more we can do
    }
    return empty();
  }

  const getSnapshot = (): T => {
    state ??= read();
    return state;
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key && e.key !== null) return;
    state = read();
    notify();
  };

  return {
    getSnapshot,
    getServerSnapshot: (): T => serverSnapshot,
    subscribe(listener: () => void): () => void {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0)
          window.removeEventListener("storage", onStorage);
      };
    },
    update(change: (s: T) => T): void {
      const next = change(getSnapshot());
      if (next === state) return;
      state = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // private mode / quota: kept in memory only
      }
      notify();
    },
    /** Tests only: forget the cached state so the next read hits storage. */
    reset(): void {
      state = null;
    },
  };
}
