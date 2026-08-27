import { handle } from '@hono/node-server/vercel';
import { app } from './app';

/**
 * Vercel Serverless Function entry point source.
 */
export default handle(app);
