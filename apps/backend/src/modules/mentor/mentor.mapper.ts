import { Prisma } from '../../prisma/client';
import { createHash } from 'node:crypto';
import type {
  MentorAdvice,
  MentorDigest,
  MentorReport,
  MentorReportStatus,
  MentorReportSummary,
} from '@journal/shared-types';
import { promptVersion } from './mentor.prompt';

const costDecimals = 6;
const moneyDecimals = 2;

/** Columnas del historial: sin digest ni advice, para que el listado pese poco. */
export const summarySelect = {
  id: true,
  createdAt: true,
  periodLabel: true,
  periodFrom: true,
  periodTo: true,
  accountLabel: true,
  status: true,
  model: true,
  trades: true,
  netBeforeDataFees: true,
  inputTokens: true,
  outputTokens: true,
  estimatedCostUsd: true,
} as const;

/** Fila de MentorReport con todas las columnas. */
type ReportRow = Prisma.MentorReportGetPayload<Record<string, never>>;
type SummaryRow = Prisma.MentorReportGetPayload<{ select: typeof summarySelect }>;

/**
 * Hash canónico del digest: claves ordenadas y sin `generatedAt`, que cambia en
 * cada cálculo y arruinaría el cache.
 * @param {MentorDigest} digest - Digest del periodo
 * @returns {string}
 */
export function digestHash(digest: MentorDigest): string {
  const { generatedAt: _ignored, ...rest } = digest;
  return createHash('sha256').update(canonicalize(rest)).digest('hex');
}

/** Serializa con las claves de cada objeto ordenadas, para que el hash sea estable. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const pairs = entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Identidad del informe: el mismo digest, periodo y versiones no se repiten. */
export function identityWhere(digest: MentorDigest, hash: string): Prisma.MentorReportWhereInput {
  return {
    accountSetKey: digest.accountSetKey,
    periodLabel: digest.period.label,
    digestVersion: digest.digestVersion,
    digestHash: hash,
    promptVersion,
  };
}

export function toSummary(row: SummaryRow): MentorReportSummary {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    periodLabel: row.periodLabel,
    periodFrom: row.periodFrom.toISOString(),
    periodTo: row.periodTo.toISOString(),
    accountLabel: row.accountLabel,
    status: row.status as MentorReportStatus,
    model: row.model,
    trades: row.trades,
    netBeforeDataFees: row.netBeforeDataFees.toFixed(moneyDecimals),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    estimatedCostUsd: row.estimatedCostUsd ? row.estimatedCostUsd.toFixed(costDecimals) : null,
  };
}

export function toReport(row: ReportRow, cached: boolean): MentorReport {
  return {
    ...toSummary(row),
    digest: row.digest as unknown as MentorDigest,
    advice: (row.advice as unknown as MentorAdvice | null) ?? null,
    cached,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function startOfDayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
