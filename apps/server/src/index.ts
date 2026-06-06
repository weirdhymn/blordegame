import Fastify from 'fastify';

const app = Fastify({ logger: true });

// Liveness probe — Phase 0 acceptance: GET /health -> { status: "ok" }.
app.get('/health', async () => ({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: '0.0.0.0' }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
