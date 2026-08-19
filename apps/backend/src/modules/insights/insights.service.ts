import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
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
  InstrumentCategory,
  KpiPoints,
  KpiSummary,
  YearlyMonth,
  YearlyReport,
  YearlyTotals,
  TimeBucket,
  TimePerformanceReport,
  TradeResult,
} from '@journal/shared-types';
import { classifyTradeResult } from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

interface TradeRow {
  enteredAt: Date;
  durationSeconds: number;
  net: Prisma.Decimal;
  gross: Prisma.Decimal;
  commission: Prisma.Decimal;
  pointsTotal: Prisma.Decimal;
  contracts: number;
  pointValueSnapshot: Prisma.Decimal;
  instrument: { category: InstrumentCategory };
}

interface PointsBucket {
  gained: Prisma.Decimal;
  lost: Prisma.Decimal;
  commission: Prisma.Decimal;
}

/** Trade reducido a lo que necesita el agrupado por día del calendario. */
interface TradeDayRow {
  enteredAt: Date;
  net: Prisma.Decimal;
  pointsTotal: Prisma.Decimal;
}

interface DayBucket {
  net: Prisma.Decimal;
  total: number;
  wins: number;
  losses: number;
}

/** Cargo del fee de data: `amount` es un costo positivo imputado a `periodStart`. */
interface FeeRow {
  periodStart: Date;
  amount: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);
const ONE_HUNDRED = 100;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async kpis(userId: string, filters: InsightsFilters): Promise<KpiSummary> {
    const [trades, fees] = await Promise.all([
      this.loadTrades(userId, filters),
      this.loadFees(userId, filters),
    ]);
    return this.computeKpis(trades, fees);
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
    const [trades, fees] = await Promise.all([
      this.loadTrades(userId, filters),
      this.loadFees(userId, filters),
    ]);
    trades.sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());

    const tradePoints = trades.map(trade => ({
      at: trade.enteredAt.toISOString(),
      net: trade.net,
    }));
    for (const fee of fees) {
      tradePoints.push({ at: fee.periodStart.toISOString(), net: fee.amount.negated() });
    }
    tradePoints.sort((a, b) => a.at.localeCompare(b.at));

    const dayBuckets = new Map<string, Prisma.Decimal>();
    for (const t of trades) {
      const key = InsightsService.dateKey(t.enteredAt);
      const curr = dayBuckets.get(key) ?? ZERO;
      dayBuckets.set(key, curr.plus(t.net));
    }
    InsightsService.subtractFeesFromDays(dayBuckets, fees);
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

    const [rows, fees] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        select: {
          enteredAt: true,
          net: true,
          gross: true,
          pointsTotal: true,
        },
        orderBy: { enteredAt: 'asc' },
      }),
      this.feesInRange(userId, accountId, start, end),
    ]);

    type Bucket = {
      trades: number;
      wins: number;
      losses: number;
      breakEven: number;
      points: Prisma.Decimal;
      gross: Prisma.Decimal;
      net: Prisma.Decimal;
      fees: Prisma.Decimal;
      winSum: Prisma.Decimal;
      lossSum: Prisma.Decimal;
    };
    const buckets: Bucket[] = Array.from({ length: 12 }, () => ({
      trades: 0,
      wins: 0,
      losses: 0,
      breakEven: 0,
      points: ZERO,
      gross: ZERO,
      net: ZERO,
      fees: ZERO,
      winSum: ZERO,
      lossSum: ZERO,
    }));

    for (const fee of fees) {
      const bucket = buckets[fee.periodStart.getUTCMonth()];
      if (bucket) {
        bucket.fees = bucket.fees.plus(fee.amount);
      }
    }

    for (const r of rows) {
      const idx = r.enteredAt.getUTCMonth();
      const b = buckets[idx];
      if (!b) continue;
      b.trades += 1;
      b.points = b.points.plus(r.pointsTotal);
      b.gross = b.gross.plus(r.gross);
      b.net = b.net.plus(r.net);
      const n = new Prisma.Decimal(r.net);
      const result = InsightsService.classify(r.pointsTotal);
      if (result === 'WIN') {
        b.wins += 1;
        b.winSum = b.winSum.plus(n);
      } else if (result === 'LOSS') {
        b.losses += 1;
        b.lossSum = b.lossSum.plus(n);
      } else {
        b.breakEven += 1;
      }
    }

    let cum = ZERO;
    const months: YearlyMonth[] = buckets.map((b, i) => {
      const monthNet = b.net.minus(b.fees);
      cum = cum.plus(monthNet);
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
        breakEven: b.breakEven,
        points: b.points.toFixed(2),
        gross: b.gross.toFixed(2),
        net: monthNet.toFixed(2),
        fees: b.fees.toFixed(2),
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
      breakEven: number;
      points: Prisma.Decimal;
      gross: Prisma.Decimal;
      net: Prisma.Decimal;
      fees: Prisma.Decimal;
      winSum: Prisma.Decimal;
      lossSum: Prisma.Decimal;
    }>,
  ): YearlyTotals {
    let trades = 0;
    let wins = 0;
    let losses = 0;
    let breakEven = 0;
    let points = ZERO;
    let gross = ZERO;
    let net = ZERO;
    let fees = ZERO;
    let winSum = ZERO;
    let lossSum = ZERO;
    for (const b of buckets) {
      trades += b.trades;
      wins += b.wins;
      losses += b.losses;
      breakEven += b.breakEven;
      points = points.plus(b.points);
      gross = gross.plus(b.gross);
      net = net.plus(b.net);
      fees = fees.plus(b.fees);
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
      breakEven,
      points: points.toFixed(2),
      gross: gross.toFixed(2),
      net: net.minus(fees).toFixed(2),
      fees: fees.toFixed(2),
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
      select: { enteredAt: true, net: true, pointsTotal: true },
    });

    type Bucket = {
      trades: number;
      wins: number;
      losses: number;
      breakEven: number;
      net: Prisma.Decimal;
    };
    const empty = (): Bucket => ({ trades: 0, wins: 0, losses: 0, breakEven: 0, net: ZERO });
    const hours: Bucket[] = Array.from({ length: 24 }, empty);
    const weekdays: Bucket[] = Array.from({ length: 7 }, empty);

    const accumulate = (bucket: Bucket | undefined, net: Prisma.Decimal, result: TradeResult) => {
      if (!bucket) {
        return;
      }
      bucket.trades += 1;
      bucket.net = bucket.net.plus(net);
      if (result === 'WIN') {
        bucket.wins += 1;
      } else if (result === 'LOSS') {
        bucket.losses += 1;
      } else {
        bucket.breakEven += 1;
      }
    };

    for (const r of rows) {
      const n = new Prisma.Decimal(r.net);
      const result = InsightsService.classify(r.pointsTotal);
      accumulate(hours[r.enteredAt.getUTCHours()], n, result);
      accumulate(weekdays[r.enteredAt.getUTCDay()], n, result);
    }

    const toBucket = (b: Bucket, key: number): TimeBucket => {
      const decided = b.wins + b.losses;
      const winRate = decided > 0 ? Number(((b.wins / decided) * ONE_HUNDRED).toFixed(2)) : 0;
      return {
        key,
        trades: b.trades,
        wins: b.wins,
        losses: b.losses,
        breakEven: b.breakEven,
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

    const [trades, fees] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        select: { enteredAt: true, net: true, pointsTotal: true },
        orderBy: { enteredAt: 'asc' },
      }),
      this.feesInRange(userId, query.accountId, start, end),
    ]);
    const feesByDay = InsightsService.feesByDay(fees);

    const dayBuckets = InsightsService.groupTradesByDay(trades);

    const days: CalendarDay[] = [];
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = 1; d <= lastDay; d++) {
      const date = `${yStr}-${mStr}-${String(d).padStart(2, '0')}`;
      const b = dayBuckets.get(date);
      const dayFees = feesByDay.get(date) ?? ZERO;
      const decided = b ? b.wins + b.losses : 0;
      days.push({
        date,
        net: (b?.net ?? ZERO).minus(dayFees).toFixed(2),
        tradesCount: b?.total ?? 0,
        fees: dayFees.toFixed(2),
        winRate: b && decided > 0 ? (b.wins / decided) * ONE_HUNDRED : 0,
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

    const range = InsightsService.dateRange(filters);
    if (range) {
      where.enteredAt = range;
    }

    return this.prisma.trade.findMany({
      where,
      select: {
        enteredAt: true,
        durationSeconds: true,
        net: true,
        gross: true,
        commission: true,
        pointsTotal: true,
        contracts: true,
        pointValueSnapshot: true,
        instrument: { select: { category: true } },
      },
      orderBy: { enteredAt: 'asc' },
    });
  }

  /**
   * Rango temporal de la consulta, compartido por trades (`enteredAt`) y fees
   * (`periodStart`). `month` gana sobre `from`/`to` igual que en los filtros.
   * @param {InsightsFilters} filters - Filtros de la consulta
   * @returns {Prisma.DateTimeFilter | undefined} undefined si no hay rango
   */
  private static dateRange(filters: InsightsFilters): Prisma.DateTimeFilter | undefined {
    if (filters.month) {
      const [yStr, mStr] = filters.month.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
    }
    if (filters.from || filters.to) {
      return {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    return undefined;
  }

  /**
   * El fee de data se cobra por cuenta y periodo, no por operación: no se puede
   * imputar a un instrumento, tipo de trade, emoción, dirección ni salida. Por
   * eso, si la consulta filtra por cualquiera de esos atributos, se omite.
   * @param {InsightsFilters} filters - Filtros de la consulta
   * @returns {boolean}
   */
  private static feesApply(filters: InsightsFilters): boolean {
    return (
      !filters.instrumentId &&
      !filters.tradeTypeId &&
      !filters.emotion &&
      !filters.direction &&
      !filters.exitReason
    );
  }

  /**
   * Carga los cargos del fee de data que caen dentro del rango filtrado.
   * @param {string} userId - Dueño de las cuentas
   * @param {InsightsFilters} filters - Filtros de la consulta
   * @returns {Promise<FeeRow[]>} Vacío si el filtro es de nivel trade
   */
  private async loadFees(userId: string, filters: InsightsFilters): Promise<FeeRow[]> {
    if (!InsightsService.feesApply(filters)) {
      return [];
    }
    const where: Prisma.DataFeeChargeWhereInput = {
      account: { userId, ...(filters.accountId ? { id: filters.accountId } : {}) },
    };
    const range = InsightsService.dateRange(filters);
    if (range) {
      where.periodStart = range;
    }

    return this.prisma.dataFeeCharge.findMany({
      where,
      select: { periodStart: true, amount: true },
      orderBy: { periodStart: 'asc' },
    });
  }

  /**
   * Cargos del fee de data en un rango explícito, para los reportes que no usan
   * `InsightsFilters` (anual y calendario).
   * @param {string} userId - Dueño de las cuentas
   * @param {string} [accountId] - Cuenta a filtrar; sin valor, todas
   * @param {Date} gte - Inicio del rango (inclusive)
   * @param {Date} lt - Fin del rango (exclusive)
   * @returns {Promise<FeeRow[]>}
   */
  private async feesInRange(
    userId: string,
    accountId: string | undefined,
    gte: Date,
    lt: Date,
  ): Promise<FeeRow[]> {
    return this.prisma.dataFeeCharge.findMany({
      where: {
        account: { userId, ...(accountId ? { id: accountId } : {}) },
        periodStart: { gte, lt },
      },
      select: { periodStart: true, amount: true },
      orderBy: { periodStart: 'asc' },
    });
  }

  private static sumFees(fees: FeeRow[]): Prisma.Decimal {
    return fees.reduce((acc, fee) => acc.plus(fee.amount), ZERO);
  }

  /** Agrupa los fees por día UTC del inicio de su periodo. */
  private static feesByDay(fees: FeeRow[]): Map<string, Prisma.Decimal> {
    const byDay = new Map<string, Prisma.Decimal>();
    for (const fee of fees) {
      const key = InsightsService.dateKey(fee.periodStart);
      byDay.set(key, (byDay.get(key) ?? ZERO).plus(fee.amount));
    }
    return byDay;
  }

  /**
   * Resta los fees del neto del día en que caen, creando el día si no tenía
   * trades (un mes sin operar igual paga el fee).
   * @param {Map<string, Prisma.Decimal>} dayBuckets - Netos por día, mutado
   * @param {FeeRow[]} fees - Cargos del fee de data
   * @returns {void}
   */
  private static subtractFeesFromDays(
    dayBuckets: Map<string, Prisma.Decimal>,
    fees: FeeRow[],
  ): void {
    for (const [key, amount] of InsightsService.feesByDay(fees)) {
      dayBuckets.set(key, (dayBuckets.get(key) ?? ZERO).minus(amount));
    }
  }

  /**
   * Agrupa los trades por día UTC con su neto, total, ganadores y perdedores.
   * @param {ReadonlyArray<TradeDayRow>} trades - Trades a agrupar
   * @returns {Map<string, DayBucket>}
   */
  private static groupTradesByDay(trades: ReadonlyArray<TradeDayRow>): Map<string, DayBucket> {
    const dayBuckets = new Map<string, DayBucket>();
    for (const t of trades) {
      const key = InsightsService.dateKey(t.enteredAt);
      const bucket = dayBuckets.get(key) ?? { net: ZERO, total: 0, wins: 0, losses: 0 };
      bucket.net = bucket.net.plus(t.net);
      bucket.total += 1;
      const result = InsightsService.classify(t.pointsTotal);
      if (result === 'WIN') {
        bucket.wins += 1;
      } else if (result === 'LOSS') {
        bucket.losses += 1;
      } else {
        // Break-even: cuenta en el total del día pero no decide el win rate.
      }
      dayBuckets.set(key, bucket);
    }
    return dayBuckets;
  }

  /**
   * Expectancy como EV = (win rate × avg win) − (loss rate × avg loss), sobre los
   * trades decididos y descontando la parte proporcional del fee de data.
   * @param {number} wins - Trades ganadores
   * @param {number} losses - Trades perdedores
   * @param {Prisma.Decimal} avgWin - Neto promedio de los ganadores
   * @param {Prisma.Decimal} avgLoss - Neto promedio de los perdedores, negativo
   * @param {Prisma.Decimal} dataFees - Fee de data del periodo
   * @returns {Prisma.Decimal}
   */
  private static computeExpectancy(
    wins: number,
    losses: number,
    avgWin: Prisma.Decimal,
    avgLoss: Prisma.Decimal,
    dataFees: Prisma.Decimal,
  ): Prisma.Decimal {
    const decided = wins + losses;
    if (decided === 0) {
      return ZERO;
    }
    const winRate = new Prisma.Decimal(wins).div(decided);
    const lossRate = new Prisma.Decimal(losses).div(decided);
    return winRate.times(avgWin).minus(lossRate.times(avgLoss.abs())).minus(dataFees.div(decided));
  }

  /**
   * Rachas máximas de ganadoras y perdedoras consecutivas. Un break-even no
   * decide nada, así que ni suma ni corta la racha en curso.
   * @param {TradeRow[]} trades - Trades ordenados por fecha de entrada
   * @returns {{ wins: number; losses: number }}
   */
  private static computeStreaks(trades: TradeRow[]): { wins: number; losses: number } {
    let maxWins = 0;
    let maxLosses = 0;
    let currWins = 0;
    let currLosses = 0;
    for (const trade of trades) {
      const result = InsightsService.classify(trade.pointsTotal);
      if (result === 'WIN') {
        currWins += 1;
        currLosses = 0;
        maxWins = Math.max(maxWins, currWins);
      } else if (result === 'LOSS') {
        currLosses += 1;
        currWins = 0;
        maxLosses = Math.max(maxLosses, currLosses);
      } else {
        // Break-even: deja la racha en curso intacta.
      }
    }
    return { wins: maxWins, losses: maxLosses };
  }

  private computeKpis(trades: TradeRow[], fees: FeeRow[]): KpiSummary {
    if (trades.length === 0 && fees.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakEvenTrades: 0,
        netPnl: '0.00',
        grossPnl: '0.00',
        totalCommission: '0.00',
        dataFees: '0.00',
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
        pointsByCategory: [],
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
      const result = InsightsService.classify(t.pointsTotal);
      if (result === 'WIN') {
        wins += 1;
        winSum = winSum.plus(n);
        if (n.gt(largestWin)) {
          largestWin = n;
        }
      } else if (result === 'LOSS') {
        losses += 1;
        lossSum = lossSum.plus(n);
        if (n.lt(largestLoss)) {
          largestLoss = n;
        }
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
    const dataFees = InsightsService.sumFees(fees);
    const expectancy = InsightsService.computeExpectancy(wins, losses, avgWin, avgLoss, dataFees);

    const dayBuckets = new Map<string, Prisma.Decimal>();
    for (const t of trades) {
      const key = InsightsService.dateKey(t.enteredAt);
      const curr = dayBuckets.get(key) ?? ZERO;
      dayBuckets.set(key, curr.plus(t.net));
    }
    InsightsService.subtractFeesFromDays(dayBuckets, fees);
    let bestDay = ZERO;
    let worstDay = ZERO;
    for (const v of dayBuckets.values()) {
      if (v.gt(bestDay)) bestDay = v;
      if (v.lt(worstDay)) worstDay = v;
    }

    const streaks = InsightsService.computeStreaks(trades);

    return {
      totalTrades: trades.length,
      winningTrades: wins,
      losingTrades: losses,
      breakEvenTrades: breakEven,
      netPnl: net.minus(dataFees).toFixed(2),
      grossPnl: gross.toFixed(2),
      totalCommission: commission.toFixed(2),
      dataFees: dataFees.toFixed(2),
      winRate: Number(winRate.toFixed(2)),
      profitFactor,
      expectancy: expectancy.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      largestWin: largestWin.toFixed(2),
      largestLoss: largestLoss.toFixed(2),
      avgDurationSeconds: trades.length > 0 ? Math.floor(durationSum / trades.length) : 0,
      bestDayNet: bestDay.toFixed(2),
      worstDayNet: worstDay.toFixed(2),
      consecutiveWins: streaks.wins,
      consecutiveLosses: streaks.losses,
      pointsByCategory: InsightsService.aggregatePoints(trades),
    };
  }

  /**
   * Suma los puntos separados por categoría de instrumento, porque un futuro se
   * mide en puntos y un CFD en pips. La comisión se convierte a puntos para poder
   * dar un neto comparable con el P&L neto en USD.
   */
  private static aggregatePoints(trades: TradeRow[]): KpiPoints[] {
    const buckets = new Map<InstrumentCategory, PointsBucket>();
    for (const t of trades) {
      const category = t.instrument.category;
      const bucket = buckets.get(category) ?? { gained: ZERO, lost: ZERO, commission: ZERO };
      const points = new Prisma.Decimal(t.pointsTotal);
      if (points.gt(0)) {
        bucket.gained = bucket.gained.plus(points);
      }
      if (points.lt(0)) {
        bucket.lost = bucket.lost.plus(points);
      }
      bucket.commission = bucket.commission.plus(InsightsService.usdToPoints(t.commission, t));
      buckets.set(category, bucket);
    }

    const categoryOrder: InstrumentCategory[] = ['FUTURE', 'CFD'];
    const result: KpiPoints[] = [];
    for (const category of categoryOrder) {
      const bucket = buckets.get(category);
      if (bucket) {
        const gross = bucket.gained.plus(bucket.lost);
        result.push({
          category,
          gained: bucket.gained.toFixed(2),
          lost: bucket.lost.toFixed(2),
          gross: gross.toFixed(2),
          commission: bucket.commission.toFixed(2),
          net: gross.minus(bucket.commission).toFixed(2),
        });
      }
    }
    return result;
  }

  /**
   * Convierte un importe en USD a puntos del instrumento del trade. `pointsTotal`
   * es el movimiento por contrato, así que el divisor incluye los contratos.
   */
  private static usdToPoints(amount: Prisma.Decimal, trade: TradeRow): Prisma.Decimal {
    const divisor = new Prisma.Decimal(trade.pointValueSnapshot).mul(trade.contracts);
    if (divisor.isZero()) return ZERO;
    return new Prisma.Decimal(amount).div(divisor);
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

  /**
   * Clasifica un trade con el umbral compartido de break-even.
   * @param {Prisma.Decimal} points - `pointsTotal` del trade
   * @returns {TradeResult}
   */
  private static classify(points: Prisma.Decimal): TradeResult {
    return classifyTradeResult(points.toNumber());
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
