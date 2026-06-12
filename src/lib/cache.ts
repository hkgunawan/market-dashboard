// Tiny in-memory TTL cache with stale-on-error fallback.
// Per server process — enough to keep us under upstream rate limits.

interface Entry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  try {
    const value = await load();
    store.set(key, { value, expires: now + ttlMs });
    return value;
  } catch (e) {
    // serve stale data (up to 30 min old) rather than failing
    if (hit && hit.expires > now - 30 * 60_000) return hit.value;
    throw e;
  }
}
