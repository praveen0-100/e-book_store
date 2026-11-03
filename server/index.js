import app from './app.js';

/** Long-running server entry (local dev, Docker, any VPS). On Vercel the app is served by api/index.js instead. */
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => console.log(`PrepPath API listening on http://localhost:${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { console.log(`${sig} received, shutting down`); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref(); });
