import { handle } from '@hono/node-server/vercel';
import { app } from './app';

/**
 * Vercel Node.js Serverless Function entry point.
 * Bundled to api/index.js via esbuild for Node.js runtime.
 */
export default handle(app);
