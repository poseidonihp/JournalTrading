import { z } from 'zod';
import {
  EmotionEnum,
  ExitReasonEnum,
  MediaKindEnum,
  TradeDirectionEnum,
  TradeSourceEnum,
} from './enums';


const MAX_ENTRY_REASON_CHARS = 2000;
const MAX_NOTES_CHARS = 10_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const CURRENCY_LENGTH = 3;
const MAX_ACCOUNT_NAME_CHARS = 60;
const MAX_SYMBOL_CHARS = 20;
const MAX_INSTRUMENT_NAME_CHARS = 120;

// ---------------------------------------------------------------------------
// Trade Media
// ---------------------------------------------------------------------------

export const TradeMediaSchema = z.object({
  id: z.string().uuid(),
  tradeId: z.string().uuid(),
  kind: MediaKindEnum,
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  position: z.number().int().nonnegative(),
});
export type TradeMedia = z.infer<typeof TradeMediaSchema>;

// ---------------------------------------------------------------------------
// Trade (output)
// ---------------------------------------------------------------------------

export const TradeSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  instrumentSymbol: z.string(),
  enteredAt: z.string(),
  exitedAt: z.string(),
  durationSeconds: z.number().int().nonnegative(),
  contracts: z.number().int().positive(),
  direction: TradeDirectionEnum,
  tradeTypeId: z.string().uuid(),
  tradeTypeName: z.string(),
  tradeTypeColor: z.string(),
  entryReason: z.string().nullable(),
  exitReason: ExitReasonEnum,
  emotion: EmotionEnum,
  pointsTotal: z.string(),
  pointValueSnapshot: z.string(),
  gross: z.string(),
  commission: z.string(),
  net: z.string(),
  notes: z.string().nullable(),
  source: TradeSourceEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
  media: z.array(TradeMediaSchema),
});
export type Trade = z.infer<typeof TradeSchema>;

// ---------------------------------------------------------------------------
// Create / Update Trade
// ---------------------------------------------------------------------------

const decimalString = z
  .union([z.string(), z.number()])
  .transform(v => (typeof v === 'number' ? v.toString() : v))
  .refine(v => /^-?\d+(\.\d+)?$/.test(v), { message: 'Número inválido' });

const CreateTradeBaseSchema = z.object({
  accountId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  enteredAt: z.string().datetime({ offset: true }),
  exitedAt: z.string().datetime({ offset: true }),
  contracts: z.number().int().positive(),
  direction: TradeDirectionEnum,
  tradeTypeId: z.string().uuid(),
  entryReason: z.string().max(MAX_ENTRY_REASON_CHARS).optional().nullable(),
  exitReason: ExitReasonEnum,
  emotion: EmotionEnum,
  pointsTotal: decimalString,
  commission: decimalString.optional(),
  grossOverride: decimalString.optional().nullable(),
  netOverride: decimalString.optional().nullable(),
  notes: z.string().max(MAX_NOTES_CHARS).optional().nullable(),
});

export const CreateTradeSchema = CreateTradeBaseSchema.refine(
  d => new Date(d.exitedAt).getTime() >= new Date(d.enteredAt).getTime(),
  {
    message: 'exitedAt debe ser posterior o igual a enteredAt',
    path: ['exitedAt'],
  },
);
export type CreateTradeDto = z.infer<typeof CreateTradeSchema>;

export const UpdateTradeSchema = CreateTradeBaseSchema.partial();
export type UpdateTradeDto = z.infer<typeof UpdateTradeSchema>;

// ---------------------------------------------------------------------------
// List / filters
// ---------------------------------------------------------------------------

export const TradeFiltersSchema = z.object({
  accountId: z.string().uuid().optional(),
  instrumentId: z.string().uuid().optional(),
  tradeTypeId: z.string().uuid().optional(),
  emotion: EmotionEnum.optional(),
  direction: TradeDirectionEnum.optional(),
  exitReason: ExitReasonEnum.optional(),
  /** Mes en formato YYYY-MM. Filtra por enteredAt dentro del mes. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type TradeFilters = z.infer<typeof TradeFiltersSchema>;

export const TradeListResponseSchema = z.object({
  items: z.array(TradeSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type TradeListResponse = z.infer<typeof TradeListResponseSchema>;

// ---------------------------------------------------------------------------
// Account create / update
// ---------------------------------------------------------------------------

export const CreateAccountSchema = z.object({
  name: z.string().min(1).max(MAX_ACCOUNT_NAME_CHARS),
  broker: z.string().max(MAX_ACCOUNT_NAME_CHARS).optional().nullable(),
  currency: z.string().length(CURRENCY_LENGTH).default('USD'),
  initialBalance: decimalString.default('0'),
  isActive: z.boolean().default(true),
  dataFeeEnabled: z.boolean().default(false),
  dataFeeAmount: decimalString.default('0'),
  dataFeeFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).nullable().optional(),
  dataFeeNextChargeAt: z.string().datetime().nullable().optional(),
});
export type CreateAccountDto = z.infer<typeof CreateAccountSchema>;

export const UpdateAccountSchema = CreateAccountSchema.partial();
export type UpdateAccountDto = z.infer<typeof UpdateAccountSchema>;

// ---------------------------------------------------------------------------
// Instrument create / update
// ---------------------------------------------------------------------------

export const CreateInstrumentSchema = z.object({
  symbol: z.string().min(1).max(MAX_SYMBOL_CHARS),
  name: z.string().min(1).max(MAX_INSTRUMENT_NAME_CHARS),
  category: z.enum(['FUTURE', 'CFD']),
  pointValue: decimalString,
  defaultCommissionPerContract: decimalString,
  tickSize: decimalString,
  currency: z.string().length(CURRENCY_LENGTH).default('USD'),
});
export type CreateInstrumentDto = z.infer<typeof CreateInstrumentSchema>;

export const UpdateInstrumentSchema = CreateInstrumentSchema.partial();
export type UpdateInstrumentDto = z.infer<typeof UpdateInstrumentSchema>;
