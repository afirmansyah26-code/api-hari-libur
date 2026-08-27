import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app';

// Serve static assets from public/ directory for local development
app.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT) || 8000;

console.log(`Server running at http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
