const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

const DATE_ONLY = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const TIME_ONLY = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

type NumericInput = string | number | null | undefined;

const secondsPerHour = 3600;
const secondsPerMinute = 60;
/** Largo de `YYYY-MM-DD`, el formato que consume `<input type="date">`. */
const dateInputLength = 10;

export function formatUsd(value: NumericInput): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) {
    return '—';
  }
  return USD.format(n);
}

/** Puntos/pips con dos decimales y signo explícito cuando son positivos. */
export function formatSignedPoints(value: NumericInput): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) {
    return '—';
  }
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return DATE_ONLY.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return TIME_ONLY.format(new Date(iso));
}

/**
 * Convierte el valor de un `<input type="date">` (`YYYY-MM-DD`) a ISO en
 * medianoche UTC, para que la fecha no se corra un día según la zona local.
 * @param {string} value - Valor del input, o vacío
 * @returns {string | null} ISO en UTC, o null si el input está vacío
 */
export function dateInputToIsoUtc(value: string): string | null {
  if (!value) {
    return null;
  }
  return `${value}T00:00:00.000Z`;
}

/**
 * Inverso de `dateInputToIsoUtc`: deja un ISO listo para un `<input type="date">`.
 * @param {string | null | undefined} iso - Fecha ISO
 * @returns {string} `YYYY-MM-DD`, o vacío si no hay fecha
 */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  return iso.slice(0, dateInputLength);
}

export function formatMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s';
  }
  const h = Math.floor(seconds / secondsPerHour);
  const m = Math.floor((seconds % secondsPerHour) / secondsPerMinute);
  const s = seconds % secondsPerMinute;
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

export function pnlClass(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n) || n === 0) {
    return 'text-fg-muted';
  }
  return n > 0 ? 'text-success' : 'text-danger';
}
