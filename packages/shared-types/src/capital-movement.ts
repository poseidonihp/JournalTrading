import { z } from 'zod';
import { CapitalMovementTypeEnum } from './enums';
import { decimalString } from './trade';

const MAX_MOVEMENT_NOTE_CHARS = 300;

/** El monto siempre es positivo: el signo lo aporta el tipo del movimiento. */
const positiveAmount = decimalString.refine((value) => Number(value) > 0, {
  message: 'El monto debe ser mayor que cero',
});

export const CapitalMovementSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  type: CapitalMovementTypeEnum,
  amount: z.string(),
  /** Fecha en la que entró o salió el dinero (ISO, medianoche UTC). */
  occurredAt: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type CapitalMovement = z.infer<typeof CapitalMovementSchema>;

export const CreateCapitalMovementSchema = z.object({
  type: CapitalMovementTypeEnum,
  amount: positiveAmount,
  occurredAt: z.string().datetime(),
  note: z.string().max(MAX_MOVEMENT_NOTE_CHARS).optional().nullable(),
});
export type CreateCapitalMovementDto = z.infer<typeof CreateCapitalMovementSchema>;

export const UpdateCapitalMovementSchema = CreateCapitalMovementSchema.partial();
export type UpdateCapitalMovementDto = z.infer<typeof UpdateCapitalMovementSchema>;
