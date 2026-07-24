import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  encryptedPassword: z
    .string()
    .min(1, 'Password requerido')
    .max(1024, 'Password cifrado demasiado largo'),
});

export type LoginDto = z.infer<typeof LoginSchema>;

export interface JwtPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
  // Identificador único del refresh token (sólo presente en tokens de refresh).
  jti?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}
