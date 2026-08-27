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
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: any, init?: any) => {
      const urlStr =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.href
          : input.url;
      if (urlStr.includes('localhost') || urlStr.includes('127.0.0.1')) {
        return originalFetch(input, init);
      }
      return Promise.resolve(
        new Response(fixtureHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export a valid Vercel request handler function', () => {
    expect(typeof handler).toBe('function');
  });

  it('should handle real Node.js HTTP server requests correctly', async () => {
    const http = await import('node:http');
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/api?year=2026&month=1&day=1`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.date).toBe('2026-01-01');
      expect(json.is_holiday).toBe(true);

      const landingRes = await fetch(`http://localhost:${port}/`);
      expect(landingRes.status).toBe(200);
      expect(landingRes.headers.get('content-type')).toContain('text/html');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
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
