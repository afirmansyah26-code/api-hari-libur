export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory TTL cache with lazy eviction and mutation safety.
 */
export class MemoryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly defaultTtlMs: number = 24 * 60 * 60 * 1000 // 24 hours default
  ) {}

  /**
   * Retrieves a cached item if present and not expired.
   * Returns a deep clone to prevent mutation of the cached value.
   */
  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return structuredClone(entry.value);
  }

  /**
   * Stores an item in cache with specified TTL.
   * Empty arrays and null/undefined values are explicitly rejected from being cached.
   */
  set(key: string, value: T, ttlMs: number = this.defaultTtlMs): void {
    if (value === null || value === undefined) return;
    if (Array.isArray(value) && value.length === 0) return;

    this.store.set(key, {
      value: structuredClone(value),
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Checks if an unexpired item exists in cache.
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Removes an item from cache.
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clears all cache entries.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Returns the count of stored entries (including yet-to-be-evicted expired items).
   */
  get size(): number {
    return this.store.size;
  }
}
