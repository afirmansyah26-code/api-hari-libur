import { handle } from '@hono/node-server/vercel';
import { app } from './app';

/**
 * Vercel Serverless Function entry point.
 * Bundled to api/index.js via esbuild.
 */
export default handle(app);
