/**
 * Parser CSV de NinjaTrader "Trade Performance" export.
 *
 * Mapeo flexible — busca columnas por nombre (case-insensitive) en el header.
 * Columnas esperadas (al menos):
 *   - Instrument          → símbolo (ej. "MES 06-26")
 *   - Market pos.         → Long / Short
 *   - Qty                 → contratos
 *   - Entry price / Exit price
 *   - Entry time / Exit time   (dd/mm/yyyy hh:mm:ss o yyyy-mm-dd hh:mm:ss)
 *   - Profit              → P&L en dólares (puede traer $ y comas)
 *   - Commission          → comisión total
 *   - Trade number        → id externo para dedupe
 */

export interface ParsedTradeRow {
  rowNumber: number;
  externalId: string | null;
  symbolRaw: string;
  symbolBase: string;
  direction: 'LONG' | 'SHORT';
  contracts: number;
  enteredAt: Date;
  exitedAt: Date;
  entryPrice: number;
  exitPrice: number;
  pointsTotal: number;
  grossOverride: number | null;
  commission: number;
}

export interface ParseError {
  row: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedTradeRow[];
  errors: ParseError[];
  totalRows: number;
}

const HEADER_ALIASES: Record<string, string[]> = {
  instrument: ['instrument', 'symbol'],
  marketPos: ['market pos.', 'market position', 'side', 'direction'],
  qty: ['qty', 'quantity', 'contracts'],
  entryPrice: ['entry price', 'entryprice'],
  exitPrice: ['exit price', 'exitprice'],
  entryTime: ['entry time', 'entrytime', 'entered at'],
  exitTime: ['exit time', 'exittime', 'exited at'],
  profit: ['profit', 'p&l', 'pnl', 'net'],
  commission: ['commission', 'comm.', 'fee'],
  tradeNumber: ['trade number', 'trade #', 'id'],
};

export function parseNtCsv(text: string): ParseResult {
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'CSV vacío' }], totalRows: 0 };
  }
  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitCsvLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
  const indexMap = buildIndexMap(headerCells);

  const requiredKeys: (keyof typeof HEADER_ALIASES)[] = [
    'instrument',
    'marketPos',
    'qty',
    'entryPrice',
    'exitPrice',
    'entryTime',
    'exitTime',
  ];
  const missing = requiredKeys.filter((k) => indexMap[k] === undefined);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: `Columnas faltantes en el header: ${missing.join(', ')}`,
        },
      ],
      totalRows: 0,
    };
  }

  const rows: ParsedTradeRow[] = [];
  const errors: ParseError[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    try {
      const parsed = parseRow(rowNumber, lines[i], delimiter, indexMap);
      if (parsed) rows.push(parsed);
    } catch (e) {
      errors.push({
        row: rowNumber,
        message: e instanceof Error ? e.message : 'Error desconocido',
      });
    }
  }
  return { rows, errors, totalRows: lines.length - 1 };
}

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

function buildIndexMap(headers: string[]): Record<string, number | undefined> {
  const map: Record<string, number | undefined> = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(h));
    map[key] = idx >= 0 ? idx : undefined;
  }
  return map;
}

function parseRow(
  rowNumber: number,
  line: string,
  delimiter: string,
  idx: Record<string, number | undefined>,
): ParsedTradeRow | null {
  const cells = splitCsvLine(line, delimiter);
  const get = (key: string): string => {
    const i = idx[key];
    if (i === undefined) return '';
    return (cells[i] ?? '').trim();
  };

  const symbolRaw = get('instrument');
  if (!symbolRaw) return null;

  const dir = normalizeDirection(get('marketPos'));
  const qty = parseInt(get('qty'), 10);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`Cantidad inválida: "${get('qty')}"`);
  }

  const entryPrice = parseNumeric(get('entryPrice'));
  const exitPrice = parseNumeric(get('exitPrice'));
  const enteredAt = parseDate(get('entryTime'));
  const exitedAt = parseDate(get('exitTime'));
  const commission = idx.commission !== undefined ? Math.abs(parseNumeric(get('commission'))) : 0;
  const profitRaw = idx.profit !== undefined ? get('profit') : '';
  const grossOverride = profitRaw ? parseNumeric(profitRaw) : null;
  const tradeNumberStr = idx.tradeNumber !== undefined ? get('tradeNumber') : '';

  const pointsRaw = dir === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
  const pointsTotal = Number.isFinite(pointsRaw) ? pointsRaw : 0;

  return {
    rowNumber,
    externalId: tradeNumberStr || null,
    symbolRaw,
    symbolBase: extractSymbolBase(symbolRaw),
    direction: dir,
    contracts: qty,
    enteredAt,
    exitedAt,
    entryPrice,
    exitPrice,
    pointsTotal,
    grossOverride,
    commission,
  };
}

function extractSymbolBase(symbol: string): string {
  // "MES 06-26" → "MES"; "MNQH6" → "MNQ"
  const trimmed = symbol.trim().toUpperCase();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx > 0) return trimmed.slice(0, spaceIdx);
  const match = /^([A-Z]+)/.exec(trimmed);
  return match ? match[1] : trimmed;
}

function normalizeDirection(raw: string): 'LONG' | 'SHORT' {
  const v = raw.toLowerCase();
  if (v.startsWith('s') || v === 'sell' || v === 'short') return 'SHORT';
  return 'LONG';
}

function parseNumeric(raw: string): number {
  const cleaned = raw.replace(/[$\s]/g, '').replace(/,/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Número inválido: "${raw}"`);
  }
  return n;
}

function parseDate(raw: string): Date {
  if (!raw) throw new Error('Fecha vacía');
  // dd/MM/yyyy [HH:mm[:ss]]
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw);
  if (slash) {
    const [, d, m, y, hh, mm, ss] = slash;
    return new Date(Date.UTC(+y, +m - 1, +d, hh ? +hh : 0, mm ? +mm : 0, ss ? +ss : 0));
  }
  // yyyy-MM-dd [HH:mm[:ss]]
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw);
  if (iso) {
    const [, y, m, d, hh, mm, ss] = iso;
    return new Date(Date.UTC(+y, +m - 1, +d, hh ? +hh : 0, mm ? +mm : 0, ss ? +ss : 0));
  }
  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  throw new Error(`Fecha inválida: "${raw}"`);
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let curr = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        curr += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        curr += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(curr);
      curr = '';
    } else {
      curr += ch;
    }
  }
  out.push(curr);
  return out;
}
