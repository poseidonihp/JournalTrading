import type { Trade } from '@journal/shared-types';
import { enumLabels } from '@journal/shared-types';

const HEADERS = [
  'Mes',
  'Producto',
  'Contratos',
  'Día',
  'Hora',
  'Duración (s)',
  'Tipo',
  'Entrada',
  'Salida',
  'Emoción',
  'Dirección',
  'Puntos',
  'Bruto',
  'Comisión',
  'Neto',
] as const;

function escape(value: string | number): string {
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDate(iso: string): { month: string; day: string; time: string } {
  const d = new Date(iso);
  return {
    month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
    day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function tradesToCsv(trades: Trade[]): string {
  const lines: string[] = [HEADERS.map(escape).join(',')];
  for (const t of trades) {
    const { month, day, time } = formatDate(t.enteredAt);
    const row = [
      month,
      t.instrumentSymbol,
      t.contracts,
      day,
      time,
      t.durationSeconds,
      t.tradeTypeName,
      t.entryReason ?? '',
      enumLabels.exitReason[t.exitReason],
      enumLabels.emotion[t.emotion],
      enumLabels.direction[t.direction],
      t.pointsTotal,
      t.gross,
      t.commission,
      t.net,
    ];
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\r\n');
}
