import { z } from 'zod';
import {
  EmotionEnum,
  ExitReasonEnum,
  InstrumentCategoryEnum,
  TradeDirectionEnum,
} from './enums';

/**
 * Umbral en puntos brutos por contrato dentro del cual un trade es break-even:
 * el movimiento apenas cubre la comisión, así que no es ganador ni perdedor.
 */
export const breakEvenPointsThreshold = 1;

export type TradeResult = 'WIN' | 'LOSS' | 'BREAKEVEN';

/**
 * Clasifica un trade por su movimiento en puntos. El umbral es simétrico, así
 * que un −1 punto es scratch igual que un +1.
 * @param {number} points - `pointsTotal` del trade (movimiento por contrato)
 * @returns {TradeResult}
 */
export function classifyTradeResult(points: number): TradeResult {
  if (Math.abs(points) <= breakEvenPointsThreshold) {
    return 'BREAKEVEN';
  }
  return points > 0 ? 'WIN' : 'LOSS';
}

// ---------------------------------------------------------------------------
// Filtros compartidos para todos los endpoints de insights
// ---------------------------------------------------------------------------

export const InsightsFiltersSchema = z.object({
  accountId: z.string().uuid().optional(),
  instrumentId: z.string().uuid().optional(),
  tradeTypeId: z.string().uuid().optional(),
  emotion: EmotionEnum.optional(),
  direction: TradeDirectionEnum.optional(),
  exitReason: ExitReasonEnum.optional(),
  /** YYYY-MM (mes de enteredAt). */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
export type InsightsFilters = z.infer<typeof InsightsFiltersSchema>;


/**
 * Puntos agregados por categoría de instrumento. La unidad es implícita:
 * FUTURE se mide en puntos y CFD en pips (ver `enumLabels.pointsUnit`).
 */
export const KpiPointsSchema = z.object({
  category: InstrumentCategoryEnum,
  /** Suma de los puntos de los trades ganadores (≥ 0). */
  gained: z.string(),
  /** Suma de los puntos de los trades perdedores (≤ 0). */
  lost: z.string(),
  /** gained + lost, es decir el movimiento de precio sin descontar comisiones. */
  gross: z.string(),
  /** Comisiones convertidas a puntos del instrumento (≥ 0). */
  commission: z.string(),
  /** gross − commission: el resultado en puntos equivalente al P&L neto. */
  net: z.string(),
});
export type KpiPoints = z.infer<typeof KpiPointsSchema>;

export const KpiSummarySchema = z.object({
  totalTrades: z.number().int().nonnegative(),
  winningTrades: z.number().int().nonnegative(),
  losingTrades: z.number().int().nonnegative(),
  breakEvenTrades: z.number().int().nonnegative(),
  /** Neto de los trades menos el fee de data del rango (ver `dataFees`). */
  netPnl: z.string(),
  grossPnl: z.string(),
  totalCommission: z.string(),
  /** Fee de data cobrado en el rango, como costo positivo. Ya está en `netPnl`. */
  dataFees: z.string(),
  winRate: z.number(),
  profitFactor: z.number().nullable(),
  expectancy: z.string(),
  avgWin: z.string(),
  avgLoss: z.string(),
  largestWin: z.string(),
  largestLoss: z.string(),
  avgDurationSeconds: z.number().int().nonnegative(),
  bestDayNet: z.string(),
  worstDayNet: z.string(),
  consecutiveWins: z.number().int().nonnegative(),
  consecutiveLosses: z.number().int().nonnegative(),
  /** Sólo trae las categorías con trades en el rango filtrado. */
  pointsByCategory: z.array(KpiPointsSchema),
});
export type KpiSummary = z.infer<typeof KpiSummarySchema>;

// ---------------------------------------------------------------------------
// Calendar (mes)
// ---------------------------------------------------------------------------

export const CalendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  accountId: z.string().uuid().optional(),
});
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;

export const CalendarDaySchema = z.object({
  date: z.string(),
  /** Neto de los trades del día menos el fee de data que cae en él. */
  net: z.string(),
  tradesCount: z.number().int().nonnegative(),
  /** Fee de data cobrado ese día, como costo positivo. Ya está en `net`. */
  fees: z.string(),
  winRate: z.number(),
});
export type CalendarDay = z.infer<typeof CalendarDaySchema>;

export const CalendarWeekStatsSchema = z.object({
  weekIndex: z.number().int().min(0),
  net: z.string(),
  tradesCount: z.number().int().nonnegative(),
});
export type CalendarWeekStats = z.infer<typeof CalendarWeekStatsSchema>;

export const CalendarMonthSchema = z.object({
  month: z.string(),
  days: z.array(CalendarDaySchema),
  weeks: z.array(CalendarWeekStatsSchema),
  monthNet: z.string(),
  tradingDays: z.number().int().nonnegative(),
});
export type CalendarMonth = z.infer<typeof CalendarMonthSchema>;

// ---------------------------------------------------------------------------
// Equity curve
// ---------------------------------------------------------------------------

export const EquityPointSchema = z.object({
  enteredAt: z.string(),
  cumulativeNet: z.string(),
  tradeNet: z.string(),
});
export type EquityPoint = z.infer<typeof EquityPointSchema>;

export const EquityCurveSchema = z.object({
  points: z.array(EquityPointSchema),
});
export type EquityCurve = z.infer<typeof EquityCurveSchema>;

// ---------------------------------------------------------------------------
// Drawdown (Fase 5 — reportes avanzados)
// ---------------------------------------------------------------------------

export const DrawdownPointSchema = z.object({
  /** ISO timestamp para serie por trade; YYYY-MM-DD para serie diaria. */
  at: z.string(),
  cumulativeNet: z.string(),
  peak: z.string(),
  /** Siempre ≤ 0. */
  drawdown: z.string(),
  /** Porcentaje sobre el peak (0–100, siempre ≥ 0). */
  drawdownPct: z.number(),
});
export type DrawdownPoint = z.infer<typeof DrawdownPointSchema>;

export const DrawdownSeriesSchema = z.object({
  points: z.array(DrawdownPointSchema),
  maxDrawdown: z.string(),
  maxDrawdownPct: z.number(),
  maxDrawdownAt: z.string().nullable(),
  currentDrawdown: z.string(),
  currentDrawdownPct: z.number(),
});
export type DrawdownSeries = z.infer<typeof DrawdownSeriesSchema>;

export const DrawdownSummarySchema = z.object({
  recoveryFactor: z.number().nullable(),
  daysInDrawdown: z.number().int().nonnegative(),
  longestDrawdownDays: z.number().int().nonnegative(),
});
export type DrawdownSummary = z.infer<typeof DrawdownSummarySchema>;

export const DrawdownReportSchema = z.object({
  byTrade: DrawdownSeriesSchema,
  byDay: DrawdownSeriesSchema,
  summary: DrawdownSummarySchema,
});
export type DrawdownReport = z.infer<typeof DrawdownReportSchema>;

// ---------------------------------------------------------------------------
// Reporte anual (resumen por mes de un año dado)
// ---------------------------------------------------------------------------

export const YearlyQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(3000),
  accountId: z.string().uuid().optional(),
});
export type YearlyQuery = z.infer<typeof YearlyQuerySchema>;

export const YearlyMonthSchema = z.object({
  /** 1–12 */
  month: z.number().int().min(1).max(12),
  trades: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  /** Trades dentro del umbral de scratch; no entran en `winRate` ni en `profitFactor`. */
  breakEven: z.number().int().nonnegative(),
  points: z.string(),
  gross: z.string(),
  /** Neto de los trades del mes menos el fee de data del mes (ver `fees`). */
  net: z.string(),
  /** Fee de data cobrado en el mes, como costo positivo. Ya está en `net`. */
  fees: z.string(),
  cumulativeNet: z.string(),
  winRate: z.number(),
  profitFactor: z.number().nullable(),
});
export type YearlyMonth = z.infer<typeof YearlyMonthSchema>;

export const YearlyTotalsSchema = z.object({
  trades: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  /** Trades dentro del umbral de scratch; no entran en `winRate` ni en `profitFactor`. */
  breakEven: z.number().int().nonnegative(),
  points: z.string(),
  gross: z.string(),
  /** Neto de los trades del año menos el fee de data del año (ver `fees`). */
  net: z.string(),
  /** Fee de data cobrado en el año, como costo positivo. Ya está en `net`. */
  fees: z.string(),
  winRate: z.number(),
  profitFactor: z.number().nullable(),
});
export type YearlyTotals = z.infer<typeof YearlyTotalsSchema>;

export const YearlyReportSchema = z.object({
  year: z.number().int(),
  months: z.array(YearlyMonthSchema),
  totals: YearlyTotalsSchema,
});
export type YearlyReport = z.infer<typeof YearlyReportSchema>;

// ---------------------------------------------------------------------------
// Trade time performance — agregado por hora del día y día de la semana
// ---------------------------------------------------------------------------

export const TimePerformanceQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(3000).optional(),
  accountId: z.string().uuid().optional(),
});
export type TimePerformanceQuery = z.infer<typeof TimePerformanceQuerySchema>;

export const TimeBucketSchema = z.object({
  /** Hora 0–23 o día de semana 0=Dom..6=Sab según el array. */
  key: z.number().int().nonnegative(),
  trades: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  /** Trades dentro del umbral de scratch; no entran en `winRate`. */
  breakEven: z.number().int().nonnegative(),
  net: z.string(),
  winRate: z.number(),
});
export type TimeBucket = z.infer<typeof TimeBucketSchema>;

export const TimePerformanceReportSchema = z.object({
  year: z.number().int().nullable(),
  byHour: z.array(TimeBucketSchema),
  byWeekday: z.array(TimeBucketSchema),
});
export type TimePerformanceReport = z.infer<typeof TimePerformanceReportSchema>;
