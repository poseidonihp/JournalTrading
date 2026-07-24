import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CalendarDay,
  CalendarMonth,
  CalendarWeekStats,
  CalendarQuery,
  DrawdownPoint,
  DrawdownReport,
  DrawdownSeries,
  DrawdownSummary,
  EquityCurve,
  EquityPoint,
  InsightsFilters,
  KpiSummary,
  YearlyMonth,
  YearlyReport,
  YearlyTotals,
  TimeBucket,
  TimePerformanceReport,
} from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

interface TradeRow {
  enteredAt: Date;
  durationSeconds: number;
  net: Prisma.Decimal;
  gross: Prisma.Decimal;
  commission: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);
const ONE_HUNDRED = 100;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async kpis(userId: string, filters: InsightsFilters): Promise<KpiSummary> {
    const trades = await this.loadTrades(userId, filters);
    return this.computeKpis(trades);
  }

  async equity(userId: string, filters: InsightsFilters): Promise<EquityCurve> {
    const trades = await this.loadTrades(userId, filters);
    trades.sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
    let acc = ZERO;
    const points: EquityPoint[] = trades.map((t) => {
      acc = acc.plus(t.net);
      return {
        enteredAt: t.enteredAt.toISOString(),
        cumulativeNet: acc.toFixed(2),
        tradeNet: t.net.toFixed(2),
      };
    });
    return { points };
  }

  async drawdown(userId: string, filters: InsightsFilters): Promise<DrawdownReport> {
    const trades = await this.loadTrades(userId, filters);
    trades.sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());

    const tradePoints = trades.map((t) => ({ at: t.enteredAt.toISOString(), net: t.net }));
    const dayBuckets = new Map<string, Prisma.Decimal>();
    for (const t of trades) {
      const key = InsightsService.dateKey(t.enteredAt);
      const curr = dayBuckets.get(key) ?? ZERO;
      dayBuckets.set(key, curr.plus(t.net));
    }
    const dayPoints = Array.from(dayBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([at, net]) => ({ at, net }));

    const byTrade = InsightsService.computeDrawdownSeries(tradePoints);
    const byDay = InsightsService.computeDrawdownSeries(dayPoints);
    const summary = InsightsService.computeDrawdownSummary(byTrade, byDay, dayPoints);

    return { byTrade, byDay, summary };
  }

  async yearly(userId: string, year: number, accountId?: string): Promise<YearlyReport> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const where: Prisma.TradeWhereInput = {
      userId,
      enteredAt: { gte: start, lt: end },
    };
    if (accountId) where.accountId = accountId;

    const rows = await this.prisma.trade.findMany({
      where,
      select: {
        enteredAt: true,
        net: true,
        gross: true,
        pointsTotal: true,
      },
      orderBy: { enteredAt: 'asc' },
    });

    type Bucket = {
      trades: number;
      wins: number;
      losses: number;
      points: Prisma.Decimal;
      gross: Prisma.Decimal;
      net: Prisma.Decimal;
      winSum: Prisma.Decimal;
      lossSum: Prisma.Decimal;
    };
    const buckets: Bucket[] = Array.from({ length: 12 }, () => ({
      trades: 0,
      wins: 0,
      losses: 0,
      points: ZERO,
      gross: ZERO,
      net: ZERO,
      winSum: ZERO,
      lossSum: ZERO,
    }));

    for (const r of rows) {
      const idx = r.enteredAt.getUTCMonth();
      const b = buckets[idx];
      if (!b) continue;
      b.trades += 1;
      b.points = b.points.plus(r.pointsTotal);
      b.gross = b.gross.plus(r.gross);
      b.net = b.net.plus(r.net);
      const n = new Prisma.Decimal(r.net);
      if (n.gt(0)) {
        b.wins += 1;
        b.winSum = b.winSum.plus(n);
      } else if (n.lt(0)) {
        b.losses += 1;
        b.lossSum = b.lossSum.plus(n);
      }
    }

    let cum = ZERO;
    const months: YearlyMonth[] = buckets.map((b, i) => {
      cum = cum.plus(b.net);
      const decided = b.wins + b.losses;
      const winRate = decided > 0 ? Number(((b.wins / decided) * ONE_HUNDRED).toFixed(2)) : 0;
      const lossAbs = b.lossSum.abs();
      const profitFactor = lossAbs.eq(0)
        ? b.winSum.gt(0)
          ? null
          : 0
        : Number(b.winSum.div(lossAbs).toFixed(2));
      return {
        month: i + 1,
        trades: b.trades,
        wins: b.wins,
        losses: b.losses,
        points: b.points.toFixed(2),
        gross: b.gross.toFixed(2),
        net: b.net.toFixed(2),
        cumulativeNet: cum.toFixed(2),
        winRate,
        profitFactor,
      };
    });

    const totals = InsightsService.aggregateYearTotals(buckets);
    return { year, months, totals };
  }

  private static aggregateYearTotals(
    buckets: ReadonlyArray<{
      trades: number;
      wins: number;
      losses: number;
      points: Prisma.Decimal;
      gross: Prisma.Decimal;
      net: Prisma.Decimal;
      winSum: Prisma.Decimal;
      lossSum: Prisma.Decimal;
    }>,
  ): YearlyTotals {
    let trades = 0;
    let wins = 0;
    let losses = 0;
    let points = ZERO;
    let gross = ZERO;
    let net = ZERO;
    let winSum = ZERO;
    let lossSum = ZERO;
    for (const b of buckets) {
      trades += b.trades;
      wins += b.wins;
      losses += b.losses;
      points = points.plus(b.points);
      gross = gross.plus(b.gross);
      net = net.plus(b.net);
      winSum = winSum.plus(b.winSum);
      lossSum = lossSum.plus(b.lossSum);
    }
    const decided = wins + losses;
    const winRate = decided > 0 ? Number(((wins / decided) * ONE_HUNDRED).toFixed(2)) : 0;
    const lossAbs = lossSum.abs();
    const profitFactor = lossAbs.eq(0)
      ? winSum.gt(0)
        ? null
        : 0
      : Number(winSum.div(lossAbs).toFixed(2));
    return {
      trades,
      wins,
      losses,
      points: points.toFixed(2),
      gross: gross.toFixed(2),
      net: net.toFixed(2),
      winRate,
      profitFactor,
    };
  }

  async timePerformance(
    userId: string,
    year?: number,
    accountId?: string,
  ): Promise<TimePerformanceReport> {
    const where: Prisma.TradeWhereInput = { userId };
    if (accountId) where.accountId = accountId;
    if (year !== undefined) {
      where.enteredAt = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      };
    }

    const rows = await this.prisma.trade.findMany({
      where,
      select: { enteredAt: true, net: true },
    });

    type Bucket = { trades: number; wins: number; losses: number; net: Prisma.Decimal };
    const empty = (): Bucket => ({ trades: 0, wins: 0, losses: 0, net: ZERO });
    const hours: Bucket[] = Array.from({ length: 24 }, empty);
    const weekdays: Bucket[] = Array.from({ length: 7 }, empty);

    for (const r of rows) {
      const h = r.enteredAt.getUTCHours();
      const w = r.enteredAt.getUTCDay();
      const hb = hours[h];
      const wb = weekdays[w];
      const n = new Prisma.Decimal(r.net);
      if (hb) {
        hb.trades += 1;
        hb.net = hb.net.plus(n);
        if (n.gt(0)) hb.wins += 1;
        else if (n.lt(0)) hb.losses += 1;
      }
      if (wb) {
        wb.trades += 1;
        wb.net = wb.net.plus(n);
        if (n.gt(0)) wb.wins += 1;
        else if (n.lt(0)) wb.losses += 1;
      }
    }

    const toBucket = (b: Bucket, key: number): TimeBucket => {
      const decided = b.wins + b.losses;
      const winRate = decided > 0 ? Number(((b.wins / decided) * ONE_HUNDRED).toFixed(2)) : 0;
      return {
        key,
        trades: b.trades,
        wins: b.wins,
        losses: b.losses,
        net: b.net.toFixed(2),
        winRate,
      };
    };

    return {
      year: year ?? null,
      byHour: hours.map((b, i) => toBucket(b, i)),
      byWeekday: weekdays.map((b, i) => toBucket(b, i)),
    };
  }

  async availableMonths(userId: string, accountId?: string): Promise<string[]> {
    const where: Prisma.TradeWhereInput = { userId };
    if (accountId) where.accountId = accountId;
    const range = await this.prisma.trade.aggregate({
      where,
      _min: { enteredAt: true },
      _max: { enteredAt: true },
    });
    const first = range._min.enteredAt;
    const last = range._max.enteredAt;
    const now = new Date();
    const endYear = now.getUTCFullYear();
    const endMonth = now.getUTCMonth();
    let startYear = endYear;
    let startMonth = endMonth;
    if (first) {
      startYear = first.getUTCFullYear();
      startMonth = first.getUTCMonth();
    }
    const lastYear = last ? Math.max(endYear, last.getUTCFullYear()) : endYear;
    const lastMonth =
      last && last.getUTCFullYear() >= endYear ? Math.max(endMonth, last.getUTCMonth()) : endMonth;
    const months: string[] = [];
    let y = lastYear;
    let m = lastMonth;
    while (y > startYear || (y === startYear && m >= startMonth)) {
      months.push(`${y}-${String(m + 1).padStart(2, '0')}`);
      m -= 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
    }
    return months;
  }

  async calendar(userId: string, query: CalendarQuery): Promise<CalendarMonth> {
    const [yStr, mStr] = query.month.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const where: Prisma.TradeWhereInput = {
      userId,
      enteredAt: { gte: start, lt: end },
    };
    if (query.accountId) where.accountId = query.accountId;

    const trades = await this.prisma.trade.findMany({
      where,
      select: { enteredAt: true, net: true },
      orderBy: { enteredAt: 'asc' },
    });

    const dayBuckets = new Map<string, { net: Prisma.Decimal; total: number; wins: number }>();
    for (const t of trades) {
      const key = InsightsService.dateKey(t.enteredAt);
      const bucket = dayBuckets.get(key) ?? { net: ZERO, total: 0, wins: 0 };
      bucket.net = bucket.net.plus(t.net);
      bucket.total += 1;
      if (new Prisma.Decimal(t.net).gt(0)) bucket.wins += 1;
      dayBuckets.set(key, bucket);
    }

    const days: CalendarDay[] = [];
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = 1; d <= lastDay; d++) {
      const date = `${yStr}-${mStr}-${String(d).padStart(2, '0')}`;
      const b = dayBuckets.get(date);
      days.push({
        date,
        net: (b?.net ?? ZERO).toFixed(2),
        tradesCount: b?.total ?? 0,
        winRate: b && b.total > 0 ? (b.wins / b.total) * ONE_HUNDRED : 0,
      });
    }

    const weeks = InsightsService.aggregateWeeks(year, month, days);
    const monthNet = days.reduce((acc, d) => acc.plus(d.net), ZERO);
    const tradingDays = days.filter((d) => d.tradesCount > 0).length;

    return {
      month: query.month,
      days,
      weeks,
      monthNet: monthNet.toFixed(2),
      tradingDays,
    };
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async loadTrades(userId: string, filters: InsightsFilters): Promise<TradeRow[]> {
    const where: Prisma.TradeWhereInput = { userId };
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.instrumentId) where.instrumentId = filters.instrumentId;
    if (filters.tradeTypeId) where.tradeTypeId = filters.tradeTypeId;
    if (filters.emotion) where.emotion = filters.emotion;
    if (filters.direction) where.direction = filters.direction;
    if (filters.exitReason) where.exitReason = filters.exitReason;

    if (filters.month) {
      const [yStr, mStr] = filters.month.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      where.enteredAt = {
        gte: new Date(Date.UTC(y, m - 1, 1)),
        lt: new Date(Date.UTC(y, m, 1)),
      };
    } else if (filters.from || filters.to) {
      where.enteredAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    const rows = await this.prisma.trade.findMany({
      where,
      select: {
        enteredAt: true,
        durationSeconds: true,
        net: true,
        gross: true,
        commission: true,
      },
      orderBy: { enteredAt: 'asc' },
    });
    return rows;
  }

  private computeKpis(trades: TradeRow[]): KpiSummary {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakEvenTrades: 0,
        netPnl: '0.00',
        grossPnl: '0.00',
        totalCommission: '0.00',
        winRate: 0,
        profitFactor: null,
        expectancy: '0.00',
        avgWin: '0.00',
        avgLoss: '0.00',
        largestWin: '0.00',
        largestLoss: '0.00',
        avgDurationSeconds: 0,
        bestDayNet: '0.00',
        worstDayNet: '0.00',
        consecutiveWins: 0,
        consecutiveLosses: 0,
      };
    }

    let net = ZERO;
    let gross = ZERO;
    let commission = ZERO;
    let wins = 0;
    let losses = 0;
    let breakEven = 0;
    let winSum = ZERO;
    let lossSum = ZERO;
    let largestWin = ZERO;
    let largestLoss = ZERO;
    let durationSum = 0;

    for (const t of trades) {
      net = net.plus(t.net);
      gross = gross.plus(t.gross);
      commission = commission.plus(t.commission);
      durationSum += t.durationSeconds;
      const n = new Prisma.Decimal(t.net);
      if (n.gt(0)) {
        wins += 1;
        winSum = winSum.plus(n);
        if (n.gt(largestWin)) largestWin = n;
      } else if (n.lt(0)) {
        losses += 1;
        lossSum = lossSum.plus(n);
        if (n.lt(largestLoss)) largestLoss = n;
      } else {
        breakEven += 1;
      }
    }

    const totalDecided = wins + losses;
    const winRate = totalDecided > 0 ? (wins / totalDecided) * ONE_HUNDRED : 0;
    const lossAbs = lossSum.abs();
    const profitFactor = lossAbs.eq(0)
      ? winSum.gt(0)
        ? null
        : 0
      : Number(winSum.div(lossAbs).toFixed(4));
    const avgWin = wins > 0 ? winSum.div(wins) : ZERO;
    const avgLoss = losses > 0 ? lossSum.div(losses) : ZERO;
    const expectancy = net.div(trades.length);

    const dayBuckets = new Map<string, Prisma.Decimal>();
    for (const t of trades) {
      const key = InsightsService.dateKey(t.enteredAt);
      const curr = dayBuckets.get(key) ?? ZERO;
      dayBuckets.set(key, curr.plus(t.net));
    }
    let bestDay = ZERO;
    let worstDay = ZERO;
    for (const v of dayBuckets.values()) {
      if (v.gt(bestDay)) bestDay = v;
      if (v.lt(worstDay)) worstDay = v;
    }

    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currWin = 0;
    let currLoss = 0;
    for (const t of trades) {
      const n = new Prisma.Decimal(t.net);
      if (n.gt(0)) {
        currWin += 1;
        currLoss = 0;
        if (currWin > maxWinStreak) maxWinStreak = currWin;
      } else if (n.lt(0)) {
        currLoss += 1;
        currWin = 0;
        if (currLoss > maxLossStreak) maxLossStreak = currLoss;
      } else {
        currWin = 0;
        currLoss = 0;
      }
    }

    return {
      totalTrades: trades.length,
      winningTrades: wins,
      losingTrades: losses,
      breakEvenTrades: breakEven,
      netPnl: net.toFixed(2),
      grossPnl: gross.toFixed(2),
      totalCommission: commission.toFixed(2),
      winRate: Number(winRate.toFixed(2)),
      profitFactor,
      expectancy: expectancy.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      largestWin: largestWin.toFixed(2),
      largestLoss: largestLoss.toFixed(2),
      avgDurationSeconds: Math.floor(durationSum / trades.length),
      bestDayNet: bestDay.toFixed(2),
      worstDayNet: worstDay.toFixed(2),
      consecutiveWins: maxWinStreak,
      consecutiveLosses: maxLossStreak,
    };
  }

  private static aggregateWeeks(
    year: number,
    month: number,
    days: CalendarDay[],
  ): CalendarWeekStats[] {
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const weeks: CalendarWeekStats[] = [];
    let weekIndex = 0;
    let weekNet = ZERO;
    let weekTrades = 0;
    let dayInWeek = firstDow;
    for (const d of days) {
      weekNet = weekNet.plus(d.net);
      weekTrades += d.tradesCount;
      dayInWeek += 1;
      if (dayInWeek >= DAYS_PER_WEEK) {
        weeks.push({ weekIndex, net: weekNet.toFixed(2), tradesCount: weekTrades });
        weekIndex += 1;
        weekNet = ZERO;
        weekTrades = 0;
        dayInWeek = 0;
      }
    }
    if (dayInWeek > 0) {
      weeks.push({ weekIndex, net: weekNet.toFixed(2), tradesCount: weekTrades });
    }
    return weeks;
  }

  private static dateKey(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  static readonly MS_PER_DAY = MS_PER_DAY;

  private static computeDrawdownSeries(
    input: ReadonlyArray<{ at: string; net: Prisma.Decimal }>,
  ): DrawdownSeries {
    if (input.length === 0) {
      return {
        points: [],
        maxDrawdown: '0.00',
        maxDrawdownPct: 0,
        maxDrawdownAt: null,
        currentDrawdown: '0.00',
        currentDrawdownPct: 0,
      };
    }

    let cum = ZERO;
    let peak = ZERO;
    let maxDd = ZERO;
    let maxDdPct = 0;
    let maxDdAt: string | null = null;
    const points: DrawdownPoint[] = [];

    for (const row of input) {
      cum = cum.plus(row.net);
      if (cum.gt(peak)) peak = cum;
      const dd = cum.minus(peak);
      const ddPct = peak.gt(0) ? Number(dd.div(peak).times(ONE_HUNDRED).abs().toFixed(4)) : 0;
      points.push({
        at: row.at,
        cumulativeNet: cum.toFixed(2),
        peak: peak.toFixed(2),
        drawdown: dd.toFixed(2),
        drawdownPct: ddPct,
      });
      if (dd.lt(maxDd)) {
        maxDd = dd;
        maxDdPct = ddPct;
        maxDdAt = row.at;
      }
    }

    const last = points[points.length - 1];
    return {
      points,
      maxDrawdown: maxDd.toFixed(2),
      maxDrawdownPct: maxDdPct,
      maxDrawdownAt: maxDdAt,
      currentDrawdown: last?.drawdown ?? '0.00',
      currentDrawdownPct: last?.drawdownPct ?? 0,
    };
  }

  private static computeDrawdownSummary(
    byTrade: DrawdownSeries,
    byDay: DrawdownSeries,
    dayPoints: ReadonlyArray<{ at: string; net: Prisma.Decimal }>,
  ): DrawdownSummary {
    const maxDdAbs = new Prisma.Decimal(byTrade.maxDrawdown).abs();
    const netPnl = dayPoints.reduce((acc, p) => acc.plus(p.net), ZERO);
    const recoveryFactor = maxDdAbs.eq(0) ? null : Number(netPnl.div(maxDdAbs).toFixed(4));

    let longest = 0;
    let current = 0;
    for (const p of byDay.points) {
      if (new Prisma.Decimal(p.drawdown).lt(0)) {
        current += 1;
        if (current > longest) longest = current;
      } else {
        current = 0;
      }
    }
    let daysInDrawdown = 0;
    for (let i = byDay.points.length - 1; i >= 0; i--) {
      const p = byDay.points[i];
      if (!p) break;
      if (new Prisma.Decimal(p.drawdown).lt(0)) {
        daysInDrawdown += 1;
      } else {
        break;
      }
    }

    return { recoveryFactor, daysInDrawdown, longestDrawdownDays: longest };
  }
}
