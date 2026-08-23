import { Prisma } from '../../prisma/client';
import {
  mentorUnreviewedBucketKey,
  type MentorBehavior,
  type MentorDaily,
  type MentorDimension,
  type MentorEliminateCandidate,
  type MentorMonthly,
  type MentorOverall,
  type MentorSourceMix,
} from '@journal/shared-types';
import {
  accumulate,
  averageMoney,
  classify,
  expectancyOf,
  money,
  monthKeyUtc,
  newAccumulator,
  percentOf,
  profitFactorOf,
  round2,
  winRateOf,
  zero,
  type IDigestTrade,
} from './digest.stats';

/** Día del periodo ya agregado; sirve al overall, a la serie y a overtrading. */
interface IDayStats {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  net: Prisma.Decimal;
}

/**
 * Agrega los trades por día UTC de `enteredAt`. El fee de data no entra: no es
 * imputable a una operación.
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @returns {IDayStats[]}
 */
function dayStats(trades: readonly IDigestTrade[]): IDayStats[] {
  const byDay = new Map<string, IDayStats>();
  for (const trade of trades) {
    let day = byDay.get(trade.dateKey);
    if (!day) {
      day = { date: trade.dateKey, trades: 0, wins: 0, losses: 0, net: zero };
      byDay.set(trade.dateKey, day);
    }
    day.trades += 1;
    day.net = day.net.plus(trade.net);
    const result = classify(trade.pointsTotal);
    if (result === 'WIN') {
      day.wins += 1;
    } else if (result === 'LOSS') {
      day.losses += 1;
    } else {
      // BREAK_EVEN no suma a wins/losses; day.trades ya lo cuenta.
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Serie diaria completa del periodo.
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @returns {MentorDaily[]}
 */
export function buildDaily(trades: readonly IDigestTrade[]): MentorDaily[] {
  return dayStats(trades).map(day => ({
    date: day.date,
    trades: day.trades,
    net: money(day.net),
    winRate: winRateOf(day.wins, day.losses),
  }));
}

/**
 * Resumen por mes UTC del rango seleccionado.
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @returns {MentorMonthly[]}
 */
export function buildMonthly(trades: readonly IDigestTrade[]): MentorMonthly[] {
  const byMonth = new Map<
    string,
    { trades: number; wins: number; losses: number; net: Prisma.Decimal }
  >();
  for (const trade of trades) {
    const key = monthKeyUtc(trade.enteredAt);
    let month = byMonth.get(key);
    if (!month) {
      month = { trades: 0, wins: 0, losses: 0, net: zero };
      byMonth.set(key, month);
    }
    month.trades += 1;
    month.net = month.net.plus(trade.net);
    const result = classify(trade.pointsTotal);
    if (result === 'WIN') {
      month.wins += 1;
    } else if (result === 'LOSS') {
      month.losses += 1;
    } else {
      // BREAK_EVEN no suma a wins/losses; month.trades ya lo cuenta.
    }
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, stats]) => ({
      month,
      trades: stats.trades,
      net: money(stats.net),
      winRate: winRateOf(stats.wins, stats.losses),
    }));
}

/**
 * KPIs del periodo. Expone el neto antes y después del fee de data con nombre
 * explícito para que nunca se confunda con el de los buckets.
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @param {Prisma.Decimal} dataFees - Fee de data del rango, como costo positivo
 * @returns {MentorOverall}
 */
export function buildOverall(
  trades: readonly IDigestTrade[],
  dataFees: Prisma.Decimal,
): MentorOverall {
  const acc = newAccumulator();
  let largestWin = zero;
  let largestLoss = zero;
  for (const trade of trades) {
    accumulate(acc, trade);
    if (trade.net.gt(largestWin)) {
      largestWin = trade.net;
    }
    if (trade.net.lt(largestLoss)) {
      largestLoss = trade.net;
    }
  }

  const days = dayStats(trades);
  const bestDay = days.reduce<Prisma.Decimal | null>(
    (best, day) => (best === null || day.net.gt(best) ? day.net : best),
    null,
  );
  const worstDay = days.reduce<Prisma.Decimal | null>(
    (worst, day) => (worst === null || day.net.lt(worst) ? day.net : worst),
    null,
  );

  return {
    trades: acc.trades,
    wins: acc.wins,
    losses: acc.losses,
    breakEven: acc.breakEven,
    grossPnl: money(acc.gross),
    commission: money(acc.commission),
    netBeforeDataFees: money(acc.net),
    netAfterDataFees: money(acc.net.minus(dataFees)),
    dataFees: money(dataFees),
    winRate: winRateOf(acc.wins, acc.losses),
    profitFactor: profitFactorOf(acc.winSum, acc.lossSum),
    expectancy: expectancyOf(acc.net, acc.trades),
    avgWin: averageMoney(acc.winSum, acc.wins),
    avgLoss: averageMoney(acc.lossSum, acc.losses),
    largestWin: money(largestWin),
    largestLoss: money(largestLoss),
    avgDurationSeconds: acc.trades === 0 ? 0 : Math.round(acc.durationSeconds / acc.trades),
    tradingDays: days.length,
    avgTradesPerDay: days.length === 0 ? 0 : round2(acc.trades / days.length),
    bestDayNet: money(bestDay ?? zero),
    worstDayNet: money(worstDay ?? zero),
  };
}

/**
 * Overtrading, tilt y disciplina. Las cuotas de disciplina se miden sólo sobre
 * los trades cargados a mano: en los importados la salida y la emoción son relleno.
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @returns {MentorBehavior}
 */
export function buildBehavior(trades: readonly IDigestTrade[]): MentorBehavior {
  const days = dayStats(trades);
  const avgTradesPerDay = days.length === 0 ? 0 : trades.length / days.length;
  const high = days.filter(day => day.trades > avgTradesPerDay);
  const normal = days.filter(day => day.trades <= avgTradesPerDay);
  const reviewed = trades.filter(trade => trade.source === 'MANUAL');

  return {
    overtrading: {
      avgTradesPerDay: round2(avgTradesPerDay),
      maxTradesInDay: days.reduce((max, day) => Math.max(max, day.trades), 0),
      highVolumeDays: high.length,
      netOnHighVolumeDays: money(sumNet(high)),
      netOnNormalVolumeDays: money(sumNet(normal)),
    },
    tilt: buildTilt(trades),
    discipline: {
      manualExitPct: shareOf(reviewed, trade => trade.exitReason === 'MANUAL'),
      initialStopPct: shareOf(reviewed, trade => trade.exitReason === 'INITIAL_STOP'),
      targetExitPct: shareOf(reviewed, trade => trade.exitReason === 'TARGET'),
      withoutEntryReasonPct: shareOf(reviewed, trade => !trade.entryReason?.trim()),
      reviewedPct: shareOf(trades, trade => trade.source === 'MANUAL'),
    },
  };
}

/**
 * Compara lo que pasa después de ganar contra lo que pasa después de perder.
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @returns {MentorBehavior['tilt']}
 */
function buildTilt(trades: readonly IDigestTrade[]): MentorBehavior['tilt'] {
  const afterWin = trades.filter(trade => trade.priorOutcome === 'AFTER_WIN');
  const afterLoss = trades.filter(
    trade =>
      trade.priorOutcome === 'AFTER_ONE_LOSS' || trade.priorOutcome === 'AFTER_TWO_PLUS_LOSSES',
  );
  const winners = trades.filter(trade => classify(trade.pointsTotal) === 'WIN');
  const losers = trades.filter(trade => classify(trade.pointsTotal) === 'LOSS');

  return {
    netAfterWin: money(sumTradeNet(afterWin)),
    netAfterLoss: money(sumTradeNet(afterLoss)),
    avgContractsAfterWin: avgContracts(afterWin),
    avgContractsAfterLoss: avgContracts(afterLoss),
    avgSecondsToNextAfterWin: avgSecondsToNext(winners),
    avgSecondsToNextAfterLoss: avgSecondsToNext(losers),
  };
}

/**
 * Contrafácticos deterministas. Sólo entran buckets accionables: confianza
 * HIGH o MEDIUM, P&L negativo, nunca el bucket de los importados sin revisar y
 * nunca uno que abarque todo el periodo, porque eso sería dejar de operar.
 * @param {readonly MentorDimension[]} dimensions - Dimensiones ya calculadas
 * @param {string} overallNet - Neto del periodo antes del fee de data
 * @param {number} totalTrades - Trades del periodo
 * @returns {MentorEliminateCandidate[]}
 */
export function buildEliminateCandidates(
  dimensions: readonly MentorDimension[],
  overallNet: string,
  totalTrades: number,
): MentorEliminateCandidate[] {
  const total = new Prisma.Decimal(overallNet);
  const candidates: MentorEliminateCandidate[] = [];
  for (const dimension of dimensions) {
    for (const bucket of dimension.buckets) {
      const net = new Prisma.Decimal(bucket.netBeforeDataFees);
      const isEligible =
        bucket.confidence !== 'LOW' &&
        net.lt(0) &&
        bucket.key !== mentorUnreviewedBucketKey &&
        bucket.trades !== totalTrades;
      if (isEligible) {
        const without = total.minus(net);
        candidates.push({
          dimensionId: dimension.id,
          bucketKey: bucket.key,
          label: bucket.label,
          dimensionLabel: dimension.label,
          trades: bucket.trades,
          netBeforeDataFees: bucket.netBeforeDataFees,
          netWithoutBucket: money(without),
          delta: money(without.minus(total)),
          confidence: bucket.confidence,
        });
      }
    }
  }
  return candidates.sort((a, b) => Number(b.delta) - Number(a.delta));
}

/**
 * Cuota de trades manuales frente a importados, para que el modelo sepa cuánto
 * del corte por emoción o por salida es dato real.
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @returns {MentorSourceMix}
 */
export function buildSourceMix(trades: readonly IDigestTrade[]): MentorSourceMix {
  const manual = trades.filter(trade => trade.source === 'MANUAL').length;
  const imported = trades.length - manual;
  return { manual, imported, importedPct: percentOf(imported, trades.length) ?? 0 };
}

function sumNet(days: readonly IDayStats[]): Prisma.Decimal {
  return days.reduce((total, day) => total.plus(day.net), zero);
}

function sumTradeNet(trades: readonly IDigestTrade[]): Prisma.Decimal {
  return trades.reduce((total, trade) => total.plus(trade.net), zero);
}

function avgContracts(trades: readonly IDigestTrade[]): number {
  if (trades.length === 0) {
    return 0;
  }
  return round2(trades.reduce((total, trade) => total + trade.contracts, 0) / trades.length);
}

/** Segundos medios hasta la siguiente entrada del mismo día; null sin muestra. */
function avgSecondsToNext(trades: readonly IDigestTrade[]): number | null {
  const gaps = trades
    .map(trade => trade.secondsToNext)
    .filter((seconds): seconds is number => seconds !== null);
  if (gaps.length === 0) {
    return null;
  }
  return Math.round(gaps.reduce((total, seconds) => total + seconds, 0) / gaps.length);
}

function shareOf(
  trades: readonly IDigestTrade[],
  predicate: (trade: IDigestTrade) => boolean,
): number {
  return percentOf(trades.filter(predicate).length, trades.length) ?? 0;
}
