import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'

/**
 * CORS configuration.
 * In development, allows all origins for easy LAN/device testing.
 * In production, parses CORS_ORIGINS env var for allowed origins.
 */
function getOriginConfig(): true | (string | RegExp)[] {
  // Development: allow all origins
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const raw = process.env.CORS_ORIGINS;

  if (!raw || raw.trim().length === 0) {
    return [
      "http://localhost:3000",
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/10\.0\.2\.2:\d+$/,
      /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
    ];
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const corsPlugin = new Elysia({ name: "plugin/cors" }).use(
  cors({
    origin: getOriginConfig(),
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

export default corsPlugin;
