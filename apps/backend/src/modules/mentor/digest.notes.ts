import type {
  MentorDigest,
  MentorNotes,
  MentorSessionNote,
  MentorTradeNote,
} from '@journal/shared-types';
import { money, type IDigestTrade } from './digest.stats';

/** Nota del notebook tal como sale de Prisma. */
export interface ISessionRow {
  date: Date;
  notes: string;
  mood: string | null;
}

/** Últimos días de la serie diaria que se conservan al degradar. */
const dailyKeepDays = 120;
/** Últimos meses que se conservan al degradar. */
const monthlyKeepMonths = 24;

/**
 * Recolecta todo el texto libre del periodo, sin muestreo. Un trade importado
 * no aporta emoción ni salida: se marcan como null para no inventar dato.
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @param {readonly ISessionRow[]} sessions - Notas del notebook del periodo
 * @returns {MentorNotes}
 */
export function collectNotes(
  trades: readonly IDigestTrade[],
  sessions: readonly ISessionRow[],
): MentorNotes {
  const tradeNotes: MentorTradeNote[] = trades
    .filter(trade => hasText(trade.entryReason) || hasText(trade.notes))
    .map(trade => ({
      tradeId: trade.id,
      date: trade.dateKey,
      net: money(trade.net),
      emotion: trade.source === 'MANUAL' ? trade.emotion : null,
      exitReason: trade.source === 'MANUAL' ? trade.exitReason : null,
      entryReason: hasText(trade.entryReason) ? trade.entryReason : null,
      notes: hasText(trade.notes) ? trade.notes : null,
    }));

  const sessionNotes: MentorSessionNote[] = sessions
    .filter(session => hasText(session.notes))
    .map(session => ({
      date: session.date.toISOString().slice(0, 'YYYY-MM-DD'.length),
      mood: session.mood,
      notes: session.notes,
    }));

  return { trades: tradeNotes, sessions: sessionNotes, truncated: false };
}

/**
 * Recorta el digest hasta caber en el presupuesto de contexto. El orden es
 * deliberado: el texto libre es lo último que se toca.
 * @param {MentorDigest} digest - Digest completo
 * @param {number} maxChars - Presupuesto en caracteres del JSON serializado
 * @returns {MentorDigest}
 */
export function applyContextBudget(digest: MentorDigest, maxChars: number): MentorDigest {
  if (sizeOf(digest) <= maxChars) {
    return digest;
  }

  let current: MentorDigest = {
    ...digest,
    daily: digest.daily.slice(-dailyKeepDays),
    truncation: { ...digest.truncation, daily: digest.daily.length > dailyKeepDays },
  };
  if (sizeOf(current) <= maxChars) {
    return current;
  }

  current = {
    ...current,
    monthly: current.monthly.slice(-monthlyKeepMonths),
    truncation: { ...current.truncation, monthly: digest.monthly.length > monthlyKeepMonths },
  };
  if (sizeOf(current) <= maxChars) {
    return current;
  }

  const notesBudget = maxChars - sizeOf({ ...current, notes: emptyNotes() });
  const notes = trimNotes(current.notes, notesBudget);
  return { ...current, notes, truncation: { ...current.truncation, notes: notes.truncated } };
}

/**
 * Deja sin texto las notas menos informativas hasta caber en el presupuesto.
 * Se conservan íntegras las de los trades perdedores y las de los peores días.
 * @param {MentorNotes} notes - Notas completas
 * @param {number} budgetChars - Caracteres disponibles para el bloque de notas
 * @returns {MentorNotes}
 */
function trimNotes(notes: MentorNotes, budgetChars: number): MentorNotes {
  const ranked = [...notes.trades.keys()].sort(
    (a, b) => noteRank(notes.trades[a]) - noteRank(notes.trades[b]),
  );
  const keep = new Set<number>();
  let used = sizeOf(notes.sessions);
  for (const index of ranked) {
    const note = notes.trades[index];
    const cost = note ? sizeOf(note) : 0;
    const fits = Boolean(note) && used + cost <= budgetChars;
    if (fits) {
      used += cost;
      keep.add(index);
    }
  }

  if (keep.size === notes.trades.length) {
    return notes;
  }
  const trades = notes.trades.map((note, index) =>
    keep.has(index) ? note : { ...note, entryReason: null, notes: null },
  );
  return { ...notes, trades, truncated: true };
}

/** Los netos más negativos primero: ahí está el diagnóstico. */
function noteRank(note: MentorTradeNote | undefined): number {
  return note ? Number(note.net) : Number.POSITIVE_INFINITY;
}

function emptyNotes(): MentorNotes {
  return { trades: [], sessions: [], truncated: true };
}

function hasText(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Tamaño del JSON serializado; es la unidad del presupuesto de contexto. */
export function sizeOf(value: unknown): number {
  return JSON.stringify(value).length;
}
