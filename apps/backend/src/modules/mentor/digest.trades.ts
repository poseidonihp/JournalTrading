import { Prisma } from '../../prisma/client';
import { classify, dateKeyUtc, type IDigestTrade } from './digest.stats';

const msPerSecond = 1000;
const oneLossStreak = 1;

/** Fila cruda de trade tal como la devuelve el select del builder. */
type TradeRow = {
  id: string;
  enteredAt: Date;
  exitedAt: Date;
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
  tradeType: { name: string };
  instrumentId: string;
  instrument: { symbol: string };
};

/**
 * Añade día UTC, orden dentro del día, resultado previo y hueco a la siguiente
 * entrada. Las filas llegan ordenadas por `enteredAt` y luego por `id`.
 * @param {readonly TradeRow[]} rows - Filas crudas
 * @returns {IDigestTrade[]}
 */
export function enrichTrades(rows: readonly TradeRow[]): IDigestTrade[] {
  const trades: IDigestTrade[] = [];
  let currentDay = '';
  let ordinal = 0;
  let lossStreak = 0;

  rows.forEach((row, index) => {
    const dateKey = dateKeyUtc(row.enteredAt);
    if (dateKey !== currentDay) {
      currentDay = dateKey;
      ordinal = 0;
      lossStreak = 0;
    }
    ordinal += 1;
    const priorOutcome = ordinal === 1 ? 'FIRST_OF_DAY' : streakBucket(lossStreak);

    const next = rows[index + 1];
    const sameDayNext = next && dateKeyUtc(next.enteredAt) === dateKey ? next : undefined;
    const secondsToNext = sameDayNext
      ? Math.max(
          0,
          Math.round((sameDayNext.enteredAt.getTime() - row.exitedAt.getTime()) / msPerSecond),
        )
      : null;

    trades.push({
      id: row.id,
      enteredAt: row.enteredAt,
      durationSeconds: row.durationSeconds,
      contracts: row.contracts,
      direction: row.direction,
      exitReason: row.exitReason,
      emotion: row.emotion,
      source: row.source,
      entryReason: row.entryReason,
      notes: row.notes,
      gross: row.gross,
      commission: row.commission,
      net: row.net,
      pointsTotal: row.pointsTotal,
      tradeTypeId: row.tradeTypeId,
      tradeTypeName: row.tradeType.name,
      instrumentId: row.instrumentId,
      instrumentSymbol: row.instrument.symbol,
      dateKey,
      ordinalOfDay: ordinal,
      priorOutcome,
      secondsToNext,
    });

    lossStreak = classify(row.pointsTotal) === 'LOSS' ? lossStreak + 1 : 0;
  });

  return trades;
}

/** Traduce la racha de pérdidas previa del día al bucket de resultado previo. */
function streakBucket(lossStreak: number): string {
  if (lossStreak === 0) {
    return 'AFTER_WIN';
  }
  return lossStreak === oneLossStreak ? 'AFTER_ONE_LOSS' : 'AFTER_TWO_PLUS_LOSSES';
}
