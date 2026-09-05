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
  'Precio entrada',
  'Precio salida',
  'Stop planeado',
  'Target planeado',
  'MAE (pts)',
  'MFE (pts)',
] as const;

function escape(value: string | number): string {
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

// Componentes en UTC: los timestamps de trade son hora de pared UTC, igual que en la UI.
function formatDate(iso: string): { month: string; day: string; time: string } {
  const d = new Date(iso);
  return {
    month: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`,
    day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
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
      t.entryPrice ?? '',
      t.exitPrice ?? '',
      t.plannedStop ?? '',
      t.plannedTarget ?? '',
      t.mae ?? '',
      t.mfe ?? '',
    ];
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\r\n');
}
