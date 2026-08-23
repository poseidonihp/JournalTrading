import { Prisma } from '../../prisma/client';
import type { MentorBucket, MentorConfidence, MentorDimension } from '@journal/shared-types';
import {
  accumulate,
  averageMoney,
  expectancyOf,
  money,
  newAccumulator,
  percentOf,
  profitFactorOf,
  winRateOf,
  zero,
  type IDigestTrade,
  type IStatsAccumulator,
} from './digest.stats';

/** Cómo se corta una dimensión: a qué bucket va cada trade y cómo se ordena. */
export interface IDimensionDefinition {
  id: MentorDimension['id'];
  label: string;
  bucketOf: (trade: IDigestTrade) => string;
  labelOf: (key: string) => string;
  order?: (a: string, b: string) => number;
}

const highConfidenceTrades = 30;
const mediumConfidenceTrades = 10;
/** Por encima de esta cuota del P&L absoluto, un solo trade explica el bucket. */
const concentrationDegradePct = 50;

/**
 * Corta los trades según una definición y devuelve la dimensión completa.
 * @param {IDimensionDefinition} definition - Cómo agrupar
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @returns {MentorDimension}
 */
export function buildDimension(
  definition: IDimensionDefinition,
  trades: readonly IDigestTrade[],
): MentorDimension {
  const groups = new Map<string, IStatsAccumulator>();
  for (const trade of trades) {
    const key = definition.bucketOf(trade);
    let acc = groups.get(key);
    if (!acc) {
      acc = newAccumulator();
      groups.set(key, acc);
    }
    accumulate(acc, trade);
  }

  const absTotal = Array.from(groups.values()).reduce((total, acc) => total.plus(acc.absNet), zero);
  const buckets = Array.from(groups.entries())
    .sort(([a], [b]) => (definition.order ?? defaultOrder)(a, b))
    .map(([key, acc]) => toBucket(key, definition.labelOf(key), acc, absTotal));

  assertPartition(definition.id, buckets, trades.length);
  return { id: definition.id, label: definition.label, buckets };
}

/**
 * Convierte un acumulador en el bucket que viaja en el digest.
 * @param {string} key - Clave del bucket
 * @param {string} label - Etiqueta legible
 * @param {IStatsAccumulator} acc - Acumulador del bucket
 * @param {Prisma.Decimal} absTotal - P&L absoluto de toda la dimensión
 * @returns {MentorBucket}
 */
function toBucket(
  key: string,
  label: string,
  acc: IStatsAccumulator,
  absTotal: Prisma.Decimal,
): MentorBucket {
  const concentration = percentOf(acc.maxAbsNet.toNumber(), acc.absNet.toNumber());
  return {
    key,
    label,
    trades: acc.trades,
    wins: acc.wins,
    losses: acc.losses,
    breakEven: acc.breakEven,
    netBeforeDataFees: money(acc.net),
    winRate: winRateOf(acc.wins, acc.losses),
    avgWin: averageMoney(acc.winSum, acc.wins),
    avgLoss: averageMoney(acc.lossSum, acc.losses),
    expectancy: expectancyOf(acc.net, acc.trades),
    profitFactor: profitFactorOf(acc.winSum, acc.lossSum),
    sharePct: percentOf(acc.absNet.toNumber(), absTotal.toNumber()),
    topTradeConcentrationPct: concentration,
    confidence: confidenceOf(acc.trades, concentration),
  };
}

/**
 * Confianza por tamaño de muestra, degradada un nivel si un solo trade explica
 * más de la mitad del P&L absoluto del bucket.
 * @param {number} trades - Trades del bucket
 * @param {number | null} concentrationPct - Cuota del mayor trade, o null
 * @returns {MentorConfidence}
 */
export function confidenceOf(trades: number, concentrationPct: number | null): MentorConfidence {
  const base = baseConfidence(trades);
  if (concentrationPct === null || concentrationPct <= concentrationDegradePct) {
    return base;
  }
  return base === 'HIGH' ? 'MEDIUM' : 'LOW';
}

/**
 * Verifica que la dimensión sea una partición. Sin esto, cualquier contrafáctico
 * de «qué pasaría si quito X» sería inválido.
 * @param {string} dimensionId - Dimensión que se está verificando
 * @param {readonly MentorBucket[]} buckets - Buckets calculados
 * @param {number} expected - Trades del periodo
 * @returns {void}
 */
export function assertPartition(
  dimensionId: string,
  buckets: readonly MentorBucket[],
  expected: number,
): void {
  const total = buckets.reduce((sum, bucket) => sum + bucket.trades, 0);
  if (total !== expected) {
    throw new Error(
      `MentorDigest > assertPartition - la dimensión ${dimensionId} suma ${total} trades y el periodo tiene ${expected}`,
    );
  }
}

/** Confianza por tamaño de muestra, antes del ajuste por concentración. */
function baseConfidence(trades: number): MentorConfidence {
  if (trades >= highConfidenceTrades) {
    return 'HIGH';
  }
  return trades >= mediumConfidenceTrades ? 'MEDIUM' : 'LOW';
}

function defaultOrder(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Orden por el valor numérico de la clave, para horas, día de semana y ordinal. */
export function numericOrder(a: string, b: string): number {
  return Number(a) - Number(b);
}

/** Orden fijo dado por una lista de claves; lo no listado va al final. */
export function fixedOrder(sequence: readonly string[]): (a: string, b: string) => number {
  return (a, b) => {
    const ia = sequence.indexOf(a);
    const ib = sequence.indexOf(b);
    return (ia === -1 ? sequence.length : ia) - (ib === -1 ? sequence.length : ib);
  };
}
