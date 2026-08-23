import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import {
  mentorDataGaps,
  type MentorDigest,
  type MentorPeriod,
  type MentorPeriodQuery,
  type MentorPreviousAdvice,
} from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildBehavior,
  buildDaily,
  buildEliminateCandidates,
  buildMonthly,
  buildOverall,
  buildSourceMix,
} from './digest.behavior';
import { buildDimensions } from './digest.dimensions';
import { applyContextBudget, collectNotes, type ISessionRow } from './digest.notes';
import { resolvePeriod, resolveRange } from './digest.period';
import { enrichTrades } from './digest.trades';
import { zero, type IDigestTrade } from './digest.stats';

/** Versión del digest. Subirla invalida el cache y permite añadir bloques nuevos. */
export const digestVersion = 1;

/** Clave del alcance cuando el informe cubre todas las cuentas del usuario. */
export const allAccountsKey = 'ALL';

/** Alcance de cuentas ya resuelto y validado como propiedad del usuario. */
export interface IAccountScope {
  ids: string[];
  key: string;
  label: string;
  currency: string;
  mixedCurrencies: boolean;
}

/**
 * Arma el digest determinista: carga los datos crudos con Prisma y ensambla
 * todos los números. No depende de OpenAI y funciona sin API key.
 * @class
 */
@Injectable()
export class DigestBuilder {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Construye el digest completo del periodo y el alcance pedidos.
   * @param {string} userId - Dueño de los datos
   * @param {MentorPeriodQuery} query - Cuenta y periodo
   * @param {number} maxChars - Presupuesto de contexto en caracteres
   * @returns {Promise<MentorDigest>}
   */
  async build(userId: string, query: MentorPeriodQuery, maxChars: number): Promise<MentorDigest> {
    const scope = await this.resolveScope(userId, query.accountId);
    const range = resolveRange(query);
    const trades = await this.loadTrades(userId, scope.ids, range);
    const period = resolvePeriod(query, trades);
    const [fees, sessions, previousAdvice] = await Promise.all([
      this.loadFees(scope.ids, range),
      this.loadSessions(userId, range),
      this.loadPreviousAdvice(userId, scope.key, period),
    ]);

    const dimensions = buildDimensions(trades);
    const overall = buildOverall(trades, fees);
    const digest: MentorDigest = {
      digestVersion,
      generatedAt: new Date().toISOString(),
      period,
      accountIds: scope.ids,
      accountSetKey: scope.key,
      accountLabel: scope.label,
      currency: scope.currency,
      mixedCurrencies: scope.mixedCurrencies,
      overall,
      dimensions,
      behavior: buildBehavior(trades),
      eliminateCandidates: buildEliminateCandidates(
        dimensions,
        overall.netBeforeDataFees,
        overall.trades,
      ),
      daily: buildDaily(trades),
      monthly: buildMonthly(trades),
      notes: collectNotes(trades, sessions),
      sourceMix: buildSourceMix(trades),
      previousAdvice,
      dataGaps: [...mentorDataGaps],
      truncation: { daily: false, monthly: false, notes: false },
    };
    return applyContextBudget(digest, maxChars);
  }

  /**
   * Resuelve y valida el alcance de cuentas. Sin `accountId` son todas las del
   * usuario; con él, se comprueba que le pertenezca.
   * @param {string} userId - Dueño de las cuentas
   * @param {string} [accountId] - Cuenta pedida
   * @returns {Promise<IAccountScope>}
   */
  private async resolveScope(userId: string, accountId?: string): Promise<IAccountScope> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, ...(accountId ? { id: accountId } : {}) },
      select: { id: true, name: true, currency: true },
      orderBy: { name: 'asc' },
    });
    if (accountId && accounts.length === 0) {
      throw new NotFoundException('La cuenta no existe o no te pertenece');
    }

    const currencies = new Set(accounts.map(account => account.currency));
    const single = accounts.length === 1 ? accounts[0] : undefined;
    return {
      ids: accounts.map(account => account.id),
      key: accountId ?? allAccountsKey,
      label: single ? single.name : `Todas las cuentas · ${accounts.length}`,
      currency: currencies.size === 1 ? (accounts[0]?.currency ?? 'USD') : 'MIXED',
      mixedCurrencies: currencies.size > 1,
    };
  }

  /**
   * Carga los trades del rango y los enriquece con el orden dentro del día, el
   * resultado previo y el hueco hasta la siguiente entrada.
   * @param {string} userId - Dueño de los trades
   * @param {string[]} accountIds - Cuentas del alcance
   * @param {Prisma.DateTimeFilter | undefined} range - Rango de `enteredAt`
   * @returns {Promise<IDigestTrade[]>}
   */
  private async loadTrades(
    userId: string,
    accountIds: string[],
    range: Prisma.DateTimeFilter | undefined,
  ): Promise<IDigestTrade[]> {
    if (accountIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.trade.findMany({
      where: { userId, accountId: { in: accountIds }, ...(range ? { enteredAt: range } : {}) },
      select: {
        id: true,
        enteredAt: true,
        exitedAt: true,
        durationSeconds: true,
        contracts: true,
        direction: true,
        exitReason: true,
        emotion: true,
        source: true,
        entryReason: true,
        notes: true,
        gross: true,
        commission: true,
        net: true,
        pointsTotal: true,
        tradeTypeId: true,
        tradeType: { select: { name: true } },
        instrumentId: true,
        instrument: { select: { symbol: true } },
      },
      orderBy: [{ enteredAt: 'asc' }, { id: 'asc' }],
    });
    return enrichTrades(rows);
  }

  /**
   * Fee de data del rango. Se filtra por el mismo rango que los trades y no por
   * el periodo recortado, o el total no cuadraría con el del dashboard.
   * @private
   * @param {string[]} accountIds - Cuentas del alcance
   * @param {Prisma.DateTimeFilter | undefined} range - Rango de `periodStart`
   * @returns {Promise<Prisma.Decimal>}
   */
  private async loadFees(
    accountIds: string[],
    range: Prisma.DateTimeFilter | undefined,
  ): Promise<Prisma.Decimal> {
    if (accountIds.length === 0) {
      return zero;
    }
    const charges = await this.prisma.dataFeeCharge.findMany({
      where: { accountId: { in: accountIds }, ...(range ? { periodStart: range } : {}) },
      select: { amount: true },
    });
    return charges.reduce((total, charge) => total.plus(charge.amount), zero);
  }

  private async loadSessions(
    userId: string,
    range: Prisma.DateTimeFilter | undefined,
  ): Promise<ISessionRow[]> {
    return this.prisma.session.findMany({
      where: { userId, ...(range ? { date: range } : {}) },
      select: { date: true, notes: true, mood: true },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Último informe de un periodo **estrictamente anterior**. Si fuera «el más
   * reciente», regenerar el mes en curso cambiaría el hash y el cache nunca acertaría.
   * @param {string} userId - Dueño de los informes
   * @param {string} accountSetKey - Alcance de cuentas
   * @param {MentorPeriod} period - Periodo en curso
   * @returns {Promise<MentorPreviousAdvice | null>}
   */
  private async loadPreviousAdvice(
    userId: string,
    accountSetKey: string,
    period: MentorPeriod,
  ): Promise<MentorPreviousAdvice | null> {
    const previous = await this.prisma.mentorReport.findFirst({
      where: {
        userId,
        accountSetKey,
        status: 'OK',
        periodTo: { lt: new Date(period.from) },
      },
      select: { id: true, periodLabel: true, advice: true },
      orderBy: [{ periodTo: 'desc' }, { createdAt: 'desc' }],
    });
    return previous ? toPreviousAdvice(previous.id, previous.periodLabel, previous.advice) : null;
  }
}

/**
 * Reduce el `advice` guardado a lo que el mentor necesita del informe anterior.
 * @param {string} reportId - Informe previo
 * @param {string} periodLabel - Etiqueta de su periodo
 * @param {unknown} advice - Columna `advice` cruda
 * @returns {MentorPreviousAdvice | null}
 */
function toPreviousAdvice(
  reportId: string,
  periodLabel: string,
  advice: unknown,
): MentorPreviousAdvice | null {
  if (!advice || typeof advice !== 'object') {
    return null;
  }
  const parsed = advice as {
    diagnosis?: { text?: string };
    rules?: { text?: string }[];
    focus?: { text?: string };
  };
  return {
    reportId,
    periodLabel,
    diagnosis: parsed.diagnosis?.text ?? '',
    rules: (parsed.rules ?? []).map(rule => rule.text ?? '').filter(Boolean),
    focus: parsed.focus?.text ?? '',
  };
}
