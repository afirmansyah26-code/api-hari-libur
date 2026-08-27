import { describe, it, expect } from 'vitest';
import handler from '../api/index';
import { app } from '../src/app';

describe('Vercel Serverless Entry Point (api/index.ts)', () => {
  it('should export a valid Vercel request handler function', () => {
    expect(typeof handler).toBe('function');
  });

  it('should delegate requests directly to the main Hono application', async () => {
    const res = await app.request('/api?year=2026&month=1&day=1');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.date).toBe('2026-01-01');
    expect(json.is_holiday).toBe(true);
    expect(json.holiday_list).toEqual(['Tahun Baru 2026 Masehi']);
  });
});
