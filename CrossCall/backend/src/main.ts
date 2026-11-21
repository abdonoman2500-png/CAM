/**
 * CrossCall Production Backend (Fastify + TypeScript + PostgreSQL + Redis + LiveKit SDK)
 * Architectural decision: Fastify chosen over NestJS for lower memory footprint on single-VPS
 * deployments, native schema-driven validation speed, and clean WebSocket signaling integration.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { AccessToken } from 'livekit-server-sdk';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { z } from 'zod';

const port = Number(process.env.PORT ?? 4000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CROSSCALL_DOMAIN ? [`https://${process.env.CROSSCALL_DOMAIN}`] : false,
  credentials: true,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis,
});

await app.register(websocket);

app.get('/api/health', async () => {
  await pool.query('SELECT 1');
  const pong = await redis.ping();
  return { status: 'ok', postgres: 'connected', redis: pong };
});

const LiveKitTokenRequestSchema = z.object({
  roomName: z.string().min(3).max(64),
  userId: z.string().uuid(),
  participantName: z.string().min(1).max(64),
  canPublish: z.boolean().default(true),
});

// LiveKit access tokens are strictly minted server-side — secrets never leave the backend.
app.post('/api/calls/livekit-token', async (request, reply) => {
  const parsed = LiveKitTokenRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'Invalid token request', issues: parsed.error.issues });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return reply.code(503).send({ error: 'LiveKit credentials not configured on server' });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: parsed.data.userId,
    name: parsed.data.participantName,
    ttl: '2h',
  });

  at.addGrant({
    roomJoin: true,
    room: parsed.data.roomName,
    canPublish: parsed.data.canPublish,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return { token, url: process.env.LIVEKIT_URL };
});

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
