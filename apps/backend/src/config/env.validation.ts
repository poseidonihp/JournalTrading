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
      .transform((v) => v === 'true'),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    // Orígenes permitidos por CORS, separados por coma.
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:4200')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    RSA_PRIVATE_KEY_B64: z
      .string()
      .min(
        1,
        'RSA_PRIVATE_KEY_B64 es requerido. Genéralo con: pnpm --filter @journal/backend gen:rsa',
      ),
  })
  .superRefine((env, ctx) => {
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
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
