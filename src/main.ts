import { serve } from '@hono/node-server';
import { app } from './app';

const port = Number(process.env.PORT) || 8000;

console.log(`Server running at http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
