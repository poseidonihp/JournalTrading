import { z } from 'zod';

// Datos del formulario en el frontend (password en claro, solo en memoria del cliente).
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// Lo que viaja realmente por HTTP: password cifrada con la clave pública RSA del backend.
export const EncryptedLoginRequestSchema = z.object({
  email: z.string().email(),
  encryptedPassword: z.string().min(1).max(1024),
});
export type EncryptedLoginRequest = z.infer<typeof EncryptedLoginRequestSchema>;

export const PublicKeyResponseSchema = z.object({
  publicKey: z.string().min(1),
});
export type PublicKeyResponse = z.infer<typeof PublicKeyResponseSchema>;

export const AuthenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
});
export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;

export const AuthResponseSchema = z.object({
  user: AuthenticatedUserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
