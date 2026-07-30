import { z } from 'zod';
import { DataFeeFrequencyEnum } from './enums';

export const AccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  broker: z.string().nullable(),
  currency: z.string().length(3),
  initialBalance: z.string(),
  /** Fecha del capital inicial (ISO). null si nunca se fijó. */
  initialBalanceAt: z.string().nullable(),
  /** Suma de los aportes registrados después del capital inicial. */
  depositsTotal: z.string(),
  /** Suma de los retiros registrados. */
  withdrawalsTotal: z.string(),
  /**
   * `initialBalance` + aportes − retiros: el dinero que salió de tu bolsillo.
   * Es la base contra la que se mide el rendimiento, no `initialBalance`.
   */
  contributedCapital: z.string(),
  currentBalance: z.string(),
  isActive: z.boolean(),
  dataFeeEnabled: z.boolean(),
  dataFeeAmount: z.string(),
  dataFeeFrequency: DataFeeFrequencyEnum.nullable(),
  dataFeeNextChargeAt: z.string().nullable(),
  dataFeeLastChargedAt: z.string().nullable(),
  /** Inicio del primer periodo cobrado, sin importar con qué monto. */
  dataFeeFirstChargedAt: z.string().nullable(),
  /**
   * Inicio del periodo desde el cual los cargos emitidos llevan `dataFeeAmount`;
   * es el «aplicar desde» efectivo del monto vigente. null si ninguno coincide.
   */
  dataFeeAmountSince: z.string().nullable(),
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
