import { z } from 'zod';

const MAX_NOTES = 20_000;
const MAX_MOOD = 40;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  notes: z.string(),
  mood: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

export const UpsertSessionSchema = z.object({
  date: z.string().regex(DATE_RE),
  notes: z.string().max(MAX_NOTES).default(''),
  mood: z.string().max(MAX_MOOD).optional().nullable(),
});
export type UpsertSessionDto = z.infer<typeof UpsertSessionSchema>;

export const SessionListQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
});
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;
