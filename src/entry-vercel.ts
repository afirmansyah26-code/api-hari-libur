import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from './app';

/**
 * Robust Vercel Serverless Function adapter for Hono.
 * Translates Node.js IncomingMessage / ServerResponse to Web Standard Request / Response.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host =
      (req.headers['x-forwarded-host'] as string) ||
      req.headers.host ||
      'localhost';
    const rawUrl = req.url || '/';
    const fullUrl = new URL(rawUrl, `${protocol}://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const v of value) {
            headers.append(key, v);
          }
        } else {
          headers.set(key, value);
        }
      }
    }

    const webRequest = new Request(fullUrl.toString(), {
      method: req.method || 'GET',
      headers,
    });

    const honoResponse = await app.fetch(webRequest);

    res.statusCode = honoResponse.status;
    honoResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const arrayBuffer = await honoResponse.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err: unknown) {
    console.error('Fatal Serverless Function Error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(
      JSON.stringify({
        message: 'Internal Server Error',
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}
