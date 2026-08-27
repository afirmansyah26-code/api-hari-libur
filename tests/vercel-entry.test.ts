import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from '../src/entry-vercel';
import { app } from '../src/app';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'tanggalans', '2026.html');

describe('Vercel Serverless Entry Point (src/entry-vercel.ts)', () => {
  beforeEach(() => {
    const fixtureHtml = fs.readFileSync(FIXTURE_PATH, 'utf8');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(fixtureHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export a valid Vercel request handler function', () => {
    expect(typeof handler).toBe('function');
  });

  it('should process Web Standard Request and return Web Standard Response', async () => {
    const webReq = new Request('http://localhost:8000/api?year=2026&month=1&day=1');
    const response = await handler(webReq);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.date).toBe('2026-01-01');
    expect(json.is_holiday).toBe(true);
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
