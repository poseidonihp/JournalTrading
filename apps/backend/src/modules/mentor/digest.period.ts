import { Prisma } from '../../prisma/client';
import type { MentorPeriod, MentorPeriodQuery } from '@journal/shared-types';
import { dateKeyUtc, type IDigestTrade } from './digest.stats';

const yearDigits = 4;

/** Nombres de mes para la etiqueta del periodo; el índice 0 es Enero. */
const monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/**
 * Rango de `enteredAt` que consulta Prisma. Sin mes ni año no hay rango: el
 * periodo es todo el histórico.
 * @param {MentorPeriodQuery} query - Cuenta y periodo pedidos
 * @returns {Prisma.DateTimeFilter | undefined}
 */
export function resolveRange(query: MentorPeriodQuery): Prisma.DateTimeFilter | undefined {
  if (query.month) {
    const [yearPart, monthPart] = query.month.split('-');
    const year = Number(yearPart);
    const month = Number(monthPart);
    return { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
  }
  if (query.year) {
    return {
      gte: new Date(Date.UTC(query.year, 0, 1)),
      lt: new Date(Date.UTC(query.year + 1, 0, 1)),
    };
  }
  return undefined;
}

/**
 * Periodo que viaja en el digest. Con «todo», `to` se recorta al último trade
 * y no a `now()`, o el hash del cache no repetiría nunca.
 * @param {MentorPeriodQuery} query - Periodo pedido
 * @param {readonly IDigestTrade[]} trades - Trades cargados, en orden
 * @returns {MentorPeriod}
 */
export function resolvePeriod(
  query: MentorPeriodQuery,
  trades: readonly IDigestTrade[],
): MentorPeriod {
  if (query.month) {
    const year = Number(query.month.slice(0, yearDigits));
    const month = Number(query.month.slice(yearDigits + 1));
    return {
      label: `${monthNames[month - 1] ?? query.month} ${year}`,
      from: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
      to: new Date(Date.UTC(year, month, 1) - 1).toISOString(),
      month: query.month,
      year,
    };
  }
  if (query.year) {
    return {
      label: `Año ${query.year}`,
      from: new Date(Date.UTC(query.year, 0, 1)).toISOString(),
      to: new Date(Date.UTC(query.year + 1, 0, 1) - 1).toISOString(),
      month: null,
      year: query.year,
    };
  }
  const first = trades[0]?.enteredAt ?? startOfTodayUtc();
  const last = trades.at(-1)?.enteredAt ?? startOfTodayUtc();
  return {
    label: 'Todo el histórico',
    from: first.toISOString(),
    to: last.toISOString(),
    month: null,
    year: null,
  };
}

/** Sin trades, un instante estable dentro del día para que el hash no cambie por milisegundo. */
function startOfTodayUtc(): Date {
  return new Date(`${dateKeyUtc(new Date())}T00:00:00.000Z`);
}
