import { buildApp } from './app.ts';
import { env } from './config/env.ts';

const app = await buildApp({ logger: true, serveFrontend: process.env.SERVE_FRONTEND === 'true' });
await app.listen({ port: env.API_PORT, host: process.env.API_HOST ?? '127.0.0.1' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.close(); process.exit(0); });
