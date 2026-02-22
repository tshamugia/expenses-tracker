import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'

/**
 * Parse the CORS_ORIGINS environment variable into an array of allowed origins.
 * Expects a comma-separated string (e.g. "https://app.example.com,https://admin.example.com").
 * Falls back to http://localhost:3000 when the variable is not set.
 */
function parseOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;

  if (!raw || raw.trim().length === 0) {
    return ["http://localhost:3000"];
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const corsPlugin = new Elysia({ name: "plugin/cors" }).use(
  cors({
    origin: parseOrigins(),
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

export default corsPlugin;
