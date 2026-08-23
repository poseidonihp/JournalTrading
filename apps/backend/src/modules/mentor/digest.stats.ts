import { Prisma } from '../../prisma/client';
import { classifyTradeResult, type TradeResult } from '@journal/shared-types';

export const zero = new Prisma.Decimal(0);
const oneHundred = 100;
const twoDecimals = 2;

/**
 * Trade reducido a lo que necesita el digest. Se lee crudo con Prisma para
 * operar con `Decimal` y no perder precisión pasando por los DTO de trades.
 */
export interface IDigestTrade {
  id: string;
  enteredAt: Date;
  durationSeconds: number;
  contracts: number;
  direction: string;
  exitReason: string;
  emotion: string;
  source: string;
  entryReason: string | null;
  notes: string | null;
  gross: Prisma.Decimal;
  commission: Prisma.Decimal;
  net: Prisma.Decimal;
  pointsTotal: Prisma.Decimal;
  tradeTypeId: string;
  tradeTypeName: string;
  instrumentId: string;
  instrumentSymbol: string;
  dateKey: string;
  ordinalOfDay: number;
  priorOutcome: string;
  secondsToNext: number | null;
}

/** Acumulador de las métricas que comparten `overall` y cada bucket. */
export interface IStatsAccumulator {
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  net: Prisma.Decimal;
  gross: Prisma.Decimal;
  commission: Prisma.Decimal;
  winSum: Prisma.Decimal;
  lossSum: Prisma.Decimal;
  durationSeconds: number;
  maxAbsNet: Prisma.Decimal;
  absNet: Prisma.Decimal;
}

export function newAccumulator(): IStatsAccumulator {
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    breakEven: 0,
    net: zero,
    gross: zero,
    commission: zero,
    winSum: zero,
    lossSum: zero,
    durationSeconds: 0,
    maxAbsNet: zero,
    absNet: zero,
  };
}

/**
 * Suma un trade al acumulador. El resultado se clasifica con el mismo umbral
 * de scratch que usa el resto del journal.
 * @param {IStatsAccumulator} acc - Acumulador a mutar
 * @param {IDigestTrade} trade - Trade a sumar
 * @returns {void}
 */
export function accumulate(acc: IStatsAccumulator, trade: IDigestTrade): void {
  acc.trades += 1;
  acc.net = acc.net.plus(trade.net);
  acc.gross = acc.gross.plus(trade.gross);
  acc.commission = acc.commission.plus(trade.commission);
  acc.durationSeconds += trade.durationSeconds;
  const abs = trade.net.abs();
  acc.absNet = acc.absNet.plus(abs);
  if (abs.gt(acc.maxAbsNet)) {
    acc.maxAbsNet = abs;
  }
  const result = classify(trade.pointsTotal);
  if (result === 'WIN') {
    acc.wins += 1;
    acc.winSum = acc.winSum.plus(trade.net);
  } else if (result === 'LOSS') {
    acc.losses += 1;
    acc.lossSum = acc.lossSum.plus(trade.net);
  } else {
    acc.breakEven += 1;
  }
}

/**
 * Clasifica un trade con el umbral compartido de break-even.
 * @param {Prisma.Decimal} points - `pointsTotal` del trade
 * @returns {TradeResult}
 */
export function classify(points: Prisma.Decimal): TradeResult {
  return classifyTradeResult(points.toNumber());
}

/**
 * Win rate sobre los trades decididos: los scratch no cuentan en el
 * denominador, igual que en Insights.
 * @param {number} wins - Ganadores
 * @param {number} losses - Perdedores
 * @returns {number}
 */
export function winRateOf(wins: number, losses: number): number {
  const decided = wins + losses;
  if (decided === 0) {
    return 0;
  }
  return round2((wins / decided) * oneHundred);
}

/**
 * Profit factor. `null` cuando no hay pérdidas pero sí ganancias, porque el
 * cociente no está definido; 0 cuando tampoco hay ganancias.
 * @param {Prisma.Decimal} winSum - Suma de netos ganadores
 * @param {Prisma.Decimal} lossSum - Suma de netos perdedores (≤ 0)
 * @returns {number | null}
 */
export function profitFactorOf(winSum: Prisma.Decimal, lossSum: Prisma.Decimal): number | null {
  const lossAbs = lossSum.abs();
  if (lossAbs.eq(0)) {
    return winSum.gt(0) ? null : 0;
  }
  return Number(winSum.div(lossAbs).toFixed(twoDecimals));
}

/**
 * Neto medio por trade. Es la expectancy antes del fee de data.
 * @param {Prisma.Decimal} net - Neto acumulado
 * @param {number} trades - Número de trades
 * @returns {string}
 */
export function expectancyOf(net: Prisma.Decimal, trades: number): string {
  if (trades === 0) {
    return money(zero);
  }
  return money(net.div(trades));
}

/**
 * Promedio de un acumulado sobre un conteo, ya formateado como importe.
 * @param {Prisma.Decimal} total - Acumulado
 * @param {number} count - Número de observaciones
 * @returns {string}
 */
export function averageMoney(total: Prisma.Decimal, count: number): string {
  return count === 0 ? money(zero) : money(total.div(count));
}

/** Importe con dos decimales, el formato con el que los Decimal cruzan el wire. */
export function money(value: Prisma.Decimal): string {
  return value.toFixed(twoDecimals);
}

/** Redondeo a dos decimales para los campos que sí viajan como número. */
export function round2(value: number): number {
  return Number(value.toFixed(twoDecimals));
}

/**
 * Porcentaje de una parte sobre un total, o null si el total es cero.
 * @param {number} part - Parte
 * @param {number} total - Total
 * @returns {number | null}
 */
export function percentOf(part: number, total: number): number | null {
  if (total === 0) {
    return null;
  }
  return round2((part / total) * oneHundred);
}

/** Día UTC en formato `YYYY-MM-DD`. Todo el digest agrupa por él. */
export function dateKeyUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(twoDecimals, '0');
  const d = String(date.getUTCDate()).padStart(twoDecimals, '0');
  return `${y}-${m}-${d}`;
}

/** Mes UTC en formato `YYYY-MM`. */
export function monthKeyUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(twoDecimals, '0');
  return `${y}-${m}`;
}
