import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // --- Lightweight mock APIs for monitoring probes and external utilities ---
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', environment: 'demo', timestamp: Date.now() });
  });

  app.get('/api/history', (req, res) => {
    // Return a lightweight mock history if needed
    res.json({
      status: 'ok',
      currentRoundId: 10010,
      history: [
        { roundId: '#10009', crashPoint: 4.21, timestamp: Date.now() - 30000 },
        { roundId: '#10008', crashPoint: 1.18, timestamp: Date.now() - 60000 }
      ]
    });
  });

  // --- Serve React Client via Vite Dev Server Middleware or Static Build ---
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Server] Integrating Vite dev server middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[Server] Operating in production mode. Serving static assets...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Aviator Demo running securely on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal error during startup:', err);
});
