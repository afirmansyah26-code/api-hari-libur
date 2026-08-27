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

  it('should handle Node.js IncomingMessage / ServerResponse cycle without crashing', async () => {
    const req = new EventEmitter() as any;
    req.method = 'GET';
    req.url = '/api?year=2026&month=1&day=1';
    req.headers = { host: 'localhost:8000' };
    req.rawHeaders = ['host', 'localhost:8000'];

    const chunks: Buffer[] = [];
    let statusCode = 0;
    const res = new EventEmitter() as any;
    res.writeHead = (status: number) => {
      statusCode = status;
    };
    res.write = (chunk: any) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    res.end = (chunk?: any) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      res.emit('finish');
    };

    await handler(req, res);
    expect(statusCode).toBe(200);
    const bodyStr = Buffer.concat(chunks).toString('utf8');
    const json = JSON.parse(bodyStr);
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
