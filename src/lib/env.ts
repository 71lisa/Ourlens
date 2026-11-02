import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().optional(),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_PROVIDER: z.string().optional(),
  PAYMENT_API_KEY: z.string().optional(),
  PAYMENT_PROVIDER: z.string().optional(),
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
});

function readServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid server environment configuration.");
  }
  return parsed.data;
}

function readClientEnv() {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    throw new Error("Invalid public environment configuration.");
  }
  return parsed.data;
}

let serverCache: z.infer<typeof serverSchema> | undefined;
let clientCache: z.infer<typeof clientSchema> | undefined;

export function env() {
  serverCache ??= readServerEnv();
  return serverCache;
}

export function publicEnv() {
  clientCache ??= readClientEnv();
  return clientCache;
}
