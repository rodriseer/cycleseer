type Entry<T> = { value: T; expiresAt: number };

export class TTLCache<T> {
  private map = new Map<string, Entry<T>>();
  constructor(private defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return;
    if (Date.now() > e.expiresAt) {
      this.map.delete(key);
      return;
    }
    return e.value;
  }

  set(key: string, value: T, ttlMs?: number) {
    this.map.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }
}

export const weatherCache = new TTLCache<any>(20 * 60 * 1000); // 20 min
export const routeCache = new TTLCache<any>(7 * 24 * 60 * 60 * 1000); // 7 days