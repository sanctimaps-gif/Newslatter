import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const envFile = process.env.ENV_FILE ?? resolve(ROOT_DIR, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  API_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  APP_SECRET: z.string().min(32, 'APP_SECRET doit contenir au moins 32 caractères (openssl rand -hex 32)'),
  PUBLIC_SITE_KEY: z.string().min(8).default('pk_sanctimaps_dev'),
  CORS_ORIGINS: z.string().default('https://sanctimaps.fr,https://www.sanctimaps.fr'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURITY: z.enum(['starttls', 'tls', 'none']).default('starttls'),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  MAIL_SANDBOX: z.string().default('true').transform((v) => v === 'true'),
  BOUNCE_WEBHOOK_SECRET: z.string().default(''),
  DEFAULT_TIMEZONE: z.string().default('Europe/Paris'),
  MEDIA_DIR: z.string().default(resolve(ROOT_DIR, 'storage/media')),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuration invalide :', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
