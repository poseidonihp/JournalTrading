import { z } from 'zod';

const MAX_DISPLAY_NAME = 80;
const MAX_TIMEZONE = 64;
const MAX_LOCALE = 16;
// Password en claro: solo vive en memoria del cliente. Por la red viaja cifrado.
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
// Payload RSA-OAEP en base64 (1024 caracteres cubre RSA-2048 y deja margen).
const MAX_ENCRYPTED_PASSWORD = 1024;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  timezone: z.string(),
  locale: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

// Esquema del formulario en el cliente — el password viaja cifrado al backend.
export const CreateUserFormSchema = z.object({
  email: z.string().email('Email inválido'),
  displayName: z.string().min(1).max(MAX_DISPLAY_NAME),
  password: z.string().min(MIN_PASSWORD).max(MAX_PASSWORD),
  timezone: z.string().min(1).max(MAX_TIMEZONE).optional(),
  locale: z.string().min(1).max(MAX_LOCALE).optional(),
});
export type CreateUserForm = z.infer<typeof CreateUserFormSchema>;

export const UpdateUserFormSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(MAX_DISPLAY_NAME).optional(),
  password: z.string().min(MIN_PASSWORD).max(MAX_PASSWORD).optional(),
  timezone: z.string().min(1).max(MAX_TIMEZONE).optional(),
  locale: z.string().min(1).max(MAX_LOCALE).optional(),
});
export type UpdateUserForm = z.infer<typeof UpdateUserFormSchema>;

// Lo que recibe realmente el backend por HTTP: password cifrado con la pública RSA.
export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(MAX_DISPLAY_NAME),
  encryptedPassword: z.string().min(1).max(MAX_ENCRYPTED_PASSWORD),
  timezone: z.string().min(1).max(MAX_TIMEZONE).optional(),
  locale: z.string().min(1).max(MAX_LOCALE).optional(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(MAX_DISPLAY_NAME).optional(),
  encryptedPassword: z.string().min(1).max(MAX_ENCRYPTED_PASSWORD).optional(),
  timezone: z.string().min(1).max(MAX_TIMEZONE).optional(),
  locale: z.string().min(1).max(MAX_LOCALE).optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
