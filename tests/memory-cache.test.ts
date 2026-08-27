import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryCache } from '../src/cache/memory-cache';

describe('MemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve cached values', () => {
    const cache = new MemoryCache<{ name: string }[]>();
    const data = [{ name: 'Tahun Baru' }];

    cache.set('holiday:2026', data);
    const retrieved = cache.get('holiday:2026');

    expect(retrieved).toEqual(data);
    expect(cache.has('holiday:2026')).toBe(true);
  });

  it('should return null for expired entries', () => {
    const cache = new MemoryCache<{ name: string }[]>(1000); // 1 sec TTL
    cache.set('holiday:2026', [{ name: 'Tahun Baru' }]);

    // Advance time past TTL
    vi.advanceTimersByTime(1500);

    expect(cache.get('holiday:2026')).toBeNull();
    expect(cache.has('holiday:2026')).toBe(false);
  });

  it('should not cache empty arrays, null, or undefined', () => {
    const cache = new MemoryCache<unknown[]>();

    cache.set('empty', []);
    cache.set('null', null as unknown as unknown[]);

    expect(cache.get('empty')).toBeNull();
    expect(cache.get('null')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('should isolate keys across different years', () => {
    const cache = new MemoryCache<string[]>();

    cache.set('holiday:2025', ['2025-data']);
    cache.set('holiday:2026', ['2026-data']);

    expect(cache.get('holiday:2025')).toEqual(['2025-data']);
    expect(cache.get('holiday:2026')).toEqual(['2026-data']);
  });

  it('should be safe from caller mutations (structuredClone)', () => {
    const cache = new MemoryCache<{ name: string }[]>();
    const original = [{ name: 'Tahun Baru' }];

    cache.set('holiday:2026', original);

    const retrieved = cache.get('holiday:2026');
    expect(retrieved).toBeDefined();

    // Mutate retrieved array
    retrieved!.push({ name: 'Mutated Item' });

    // Ensure cache itself was not modified
    const fresh = cache.get('holiday:2026');
    expect(fresh).toHaveLength(1);
    expect(fresh![0].name).toBe('Tahun Baru');
  });

  it('should support delete and clear operations', () => {
    const cache = new MemoryCache<string>();

    cache.set('k1', 'v1');
    cache.set('k2', 'v2');

    cache.delete('k1');
    expect(cache.has('k1')).toBe(false);
    expect(cache.has('k2')).toBe(true);

    cache.clear();
    expect(cache.has('k2')).toBe(false);
    expect(cache.size).toBe(0);
  });
});
