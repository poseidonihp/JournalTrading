import { z } from 'zod';

const MAX_TRADE_TYPE_NAME = 60;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const TradeTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  code: z.string().nullable(),
  tradesCount: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
});
export type TradeType = z.infer<typeof TradeTypeSchema>;

export const CreateTradeTypeSchema = z.object({
  name: z.string().min(1).max(MAX_TRADE_TYPE_NAME),
  color: z.string().regex(HEX_COLOR_RE, { message: 'Color inválido (formato esperado: #rrggbb)' }),
});
export type CreateTradeTypeDto = z.infer<typeof CreateTradeTypeSchema>;

export const UpdateTradeTypeSchema = CreateTradeTypeSchema.partial();
export type UpdateTradeTypeDto = z.infer<typeof UpdateTradeTypeSchema>;
