import { z } from "zod";
import dotenv from "dotenv";

// Load .env if present
dotenv.config();

const configSchema = z.object({
  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .or(z.undefined())
    .transform((val) => val || process.env.MONGO_URL || ""),
  MONGODB_DB: z.string().default("session_counter"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters long"),
  JWT_TTL_HOURS: z.coerce.number().int().positive().default(8),
  MAX_SESSIONS: z.coerce.number().int().positive().default(200),
  APP_ORIGIN: z
    .string()
    .url("APP_ORIGIN must be a valid URL")
    .transform((val) => val.replace(/\/+$/, "")), // no trailing slash
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const rawConfig = {
  MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URL,
  MONGODB_DB: process.env.MONGODB_DB,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_TTL_HOURS: process.env.JWT_TTL_HOURS,
  MAX_SESSIONS: process.env.MAX_SESSIONS || process.env.MAX_EVENTS,
  APP_ORIGIN: process.env.APP_ORIGIN,
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
};

const parsed = configSchema.safeParse(rawConfig);

if (!parsed.success) {
  const errors = parsed.error.format();
  console.error("Configuration validation failed:", JSON.stringify(errors, null, 2));
  throw new Error("Invalid application configuration. Check environment variables.");
}

export const config = parsed.data;
export type Config = z.infer<typeof configSchema>;
