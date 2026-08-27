import { handle } from '@hono/node-server/vercel';
import { app } from '../src/app';

/**
 * Vercel Serverless Function entry point.
 */
export default handle(app);
