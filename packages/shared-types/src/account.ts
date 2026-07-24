import { z } from 'zod';
import { DataFeeFrequencyEnum } from './enums';

export const AccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  broker: z.string().nullable(),
  currency: z.string().length(3),
  initialBalance: z.string(),
  currentBalance: z.string(),
  isActive: z.boolean(),
  dataFeeEnabled: z.boolean(),
  dataFeeAmount: z.string(),
  dataFeeFrequency: DataFeeFrequencyEnum.nullable(),
  dataFeeNextChargeAt: z.string().nullable(),
  dataFeeLastChargedAt: z.string().nullable(),
});
export type Account = z.infer<typeof AccountSchema>;

export const InstrumentSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  name: z.string(),
  category: z.enum(['FUTURE', 'CFD']),
  pointValue: z.string(),
  defaultCommissionPerContract: z.string(),
  tickSize: z.string(),
  currency: z.string().length(3),
});
export type Instrument = z.infer<typeof InstrumentSchema>;
