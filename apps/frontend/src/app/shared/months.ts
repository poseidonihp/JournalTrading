/**
 * Catálogo único de meses y utilidades para las claves `YYYY-MM` que usan los
 * filtros. No se guardan en base de datos: son un catálogo fijo de
 * presentación, no datos del usuario.
 */

/** Nombres largos en español; el índice 0 es Enero. */
export const monthNames = [
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

/** Abreviaturas de tres letras, en el mismo orden que `monthNames`. */
export const monthNamesShort = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

/** Abreviaturas de los días de la semana; el índice 0 es Domingo, como `getUTCDay()`. */
export const weekdayNamesShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

export const monthsPerYear = 12;

/** Opción de un `<select>` de mes: el valor es 1–12 y la etiqueta el nombre. */
export interface IMonthOption {
  value: number;
  label: string;
}

/** Año y mes (1–12) ya descompuestos desde una clave `YYYY-MM`. */
export interface IYearMonth {
  year: number;
  month: number;
}

/** Rango ISO cerrado, tal como lo esperan los filtros `from`/`to`. */
export interface IIsoRange {
  from: string;
  to: string;
}

/** Las doce opciones de un selector de mes, sin el año. */
export const monthOptions: readonly IMonthOption[] = monthNames.map((label, index) => ({
  value: index + 1,
  label,
}));

const monthKeyPattern = /^(\d{4})-(\d{2})$/;
const monthKeyDigits = 2;
const yearDigits = 4;

/**
 * Nombre largo de un mes.
 * @param {number} month - Mes 1–12
 * @returns {string}
 */
export function monthName(month: number): string {
  return monthNames[month - 1] ?? '';
}

/**
 * Abreviatura de un mes.
 * @param {number} month - Mes 1–12
 * @returns {string}
 */
export function monthNameShort(month: number): string {
  return monthNamesShort[month - 1] ?? '';
}

/**
 * Arma la clave `YYYY-MM` que consumen los filtros del backend.
 * @param {number} year - Año
 * @param {number} month - Mes 1–12
 * @returns {string}
 */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(monthKeyDigits, '0')}`;
}

/**
 * Descompone una clave `YYYY-MM`.
 * @param {string | null | undefined} key - Clave del mes
 * @returns {IYearMonth | null}
 */
export function parseMonthKey(key: string | null | undefined): IYearMonth | null {
  if (!key) {
    return null;
  }
  const match = monthKeyPattern.exec(key);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > monthsPerYear) {
    return null;
  }
  return { year, month };
}

/** Clave del mes en curso, en hora local: es el mes que el usuario ve en su calendario. */
export function currentMonthKey(): string {
  const now = new Date();
  return monthKey(now.getFullYear(), now.getMonth() + 1);
}

/**
 * Desplaza una clave `YYYY-MM` en meses, cruzando el cambio de año.
 * @param {string} key - Clave del mes
 * @param {number} delta - Meses a sumar (puede ser negativo)
 * @returns {string}
 */
export function shiftMonthKey(key: string, delta: number): string {
  const parsed = parseMonthKey(key);
  if (!parsed) {
    return key;
  }
  const total = parsed.year * monthsPerYear + (parsed.month - 1) + delta;
  const year = Math.floor(total / monthsPerYear);
  return monthKey(year, total - year * monthsPerYear + 1);
}

/**
 * Etiqueta «Enero 2026», para títulos donde el año sí aporta contexto.
 * @param {string} key - Clave `YYYY-MM`
 * @returns {string}
 */
export function monthYearLabel(key: string): string {
  const parsed = parseMonthKey(key);
  if (!parsed) {
    return key;
  }
  return `${monthName(parsed.month)} ${parsed.year}`;
}

/**
 * Años presentes en una lista de claves `YYYY-MM`, del más reciente al más antiguo.
 * @param {readonly string[]} keys - Claves de mes
 * @returns {number[]}
 */
export function yearsFromMonthKeys(keys: readonly string[]): number[] {
  const years = new Set<number>();
  for (const key of keys) {
    const parsed = parseMonthKey(key);
    if (parsed) {
      years.add(parsed.year);
    }
  }
  return Array.from(years).sort((a, b) => b - a);
}

/**
 * Rango ISO en UTC que cubre un año completo, para los filtros `from`/`to`.
 * @param {number} year - Año a cubrir
 * @returns {IIsoRange}
 */
export function yearRange(year: number): IIsoRange {
  return { from: `${year}-01-01T00:00:00.000Z`, to: `${year}-12-31T23:59:59.999Z` };
}

/**
 * Año de una fecha ISO que arranca en `YYYY-`.
 * @param {string | null | undefined} iso - Fecha ISO
 * @returns {number | null}
 */
export function yearFromIso(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const year = Number(iso.slice(0, yearDigits));
  return Number.isNaN(year) ? null : year;
}

/**
 * Meses de un año concreto dentro de una lista de claves `YYYY-MM`, ascendente.
 * @param {readonly string[]} keys - Claves de mes
 * @param {number} year - Año a filtrar
 * @returns {number[]}
 */
export function monthsOfYear(keys: readonly string[], year: number): number[] {
  const months = new Set<number>();
  for (const key of keys) {
    const parsed = parseMonthKey(key);
    if (parsed && parsed.year === year) {
      months.add(parsed.month);
    }
  }
  return Array.from(months).sort((a, b) => a - b);
}
