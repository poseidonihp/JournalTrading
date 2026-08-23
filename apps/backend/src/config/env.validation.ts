import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
    // Secreto independiente para refresh tokens. Si no se define, cae a JWT_SECRET
    // (recomendado separarlos para que un access token filtrado no firme refresh).
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres')
      .optional(),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    COOKIE_SECRET: z.string().min(16),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: z
      .string()
      .default('false')
      .transform(v => v === 'true'),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    // Orígenes permitidos por CORS, separados por coma.
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:4200')
      .transform(v =>
        v
          .split(',')
          .map(o => o.trim())
          .filter(Boolean),
      ),
    RSA_PRIVATE_KEY_B64: z
      .string()
      .min(
        1,
        'RSA_PRIVATE_KEY_B64 es requerido. Genéralo con: pnpm --filter @journal/backend gen:rsa',
      ),
    // Raíz de los uploads en disco. Debe declararse aquí aunque LocalDiskDriver la
    // lea de process.env: ConfigModule sólo propaga a process.env las claves que
    // devuelve este validador, y Zod descarta las no declaradas.
    STORAGE_ROOT: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    OPENAI_MODEL: z.string().optional(),
    OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(3000),
    MENTOR_MIN_TRADES: z.coerce.number().int().positive().default(20),
    MENTOR_MAX_DIGEST_CHARS: z.coerce.number().int().positive().default(240_000),
    MENTOR_DAILY_LIMIT: z.coerce.number().int().positive().default(20),
    MENTOR_PRICE_INPUT_PER_MTOK: z.coerce.number().min(0).default(0),
    MENTOR_PRICE_OUTPUT_PER_MTOK: z.coerce.number().min(0).default(0),
  })
  .superRefine((env, ctx) => {
    // Coherencia del bloque Mentor: con key pero sin modelo no hay nada que llamar.
    if (env.OPENAI_API_KEY && !env.OPENAI_MODEL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_MODEL'],
        message: 'OPENAI_MODEL es requerido cuando OPENAI_API_KEY está definida',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE debe ser "true" en producción (cookies sólo sobre HTTPS)',
        });
      }
      if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SAMESITE'],
          message: 'SameSite=None requiere COOKIE_SECURE=true',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
