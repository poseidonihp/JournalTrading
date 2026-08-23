import {
  enumLabels,
  mentorDimensionLabels,
  type MentorBucket,
  type MentorConfidence,
  type MentorDigest,
  type MentorDimensionId,
} from '@journal/shared-types';

const percentDecimals = 0;
const pfDecimals = 2;
const strongPf = 1.5;
const breakEvenPf = 1;
const winRateBalance = 50;
const successClass = 'text-success';

/**
 * Etiqueta de una dimensión del digest.
 * @param {MentorDimensionId} id - Dimensión
 * @returns {string}
 */
export function dimensionLabel(id: MentorDimensionId): string {
  return mentorDimensionLabels[id];
}

/**
 * Etiqueta legible de un bucket. El backend ya la calcula, así que sólo se
 * busca en el digest; sin coincidencia se muestra la clave cruda.
 * @param {MentorDigest | null} digest - Digest de referencia
 * @param {MentorDimensionId} dimensionId - Dimensión del bucket
 * @param {string} bucketKey - Clave del bucket
 * @returns {string}
 */
export function bucketLabel(
  digest: MentorDigest | null,
  dimensionId: MentorDimensionId,
  bucketKey: string,
): string {
  return findBucket(digest, dimensionId, bucketKey)?.label ?? bucketKey;
}

/**
 * Bucket real del digest. Es lo que permite renderizar cifras verificadas al
 * lado de cada frase del modelo en vez de creerle el número.
 * @param {MentorDigest | null} digest - Digest de referencia
 * @param {MentorDimensionId} dimensionId - Dimensión del bucket
 * @param {string} bucketKey - Clave del bucket
 * @returns {MentorBucket | null}
 */
export function findBucket(
  digest: MentorDigest | null,
  dimensionId: MentorDimensionId,
  bucketKey: string,
): MentorBucket | null {
  const dimension = digest?.dimensions.find(item => item.id === dimensionId);
  return dimension?.buckets.find(bucket => bucket.key === bucketKey) ?? null;
}

/**
 * Etiqueta española del nivel de confianza.
 * @param {MentorConfidence} confidence - Nivel
 * @returns {string}
 */
export function confidenceLabel(confidence: MentorConfidence): string {
  return enumLabels.mentorConfidence[confidence];
}

/**
 * Clase del chip de confianza. Los `LOW` van en gris y no son accionables.
 * @param {MentorConfidence} confidence - Nivel
 * @returns {string}
 */
export function confidenceClass(confidence: MentorConfidence): string {
  return `conf conf-${confidence.toLowerCase()}`;
}

/**
 * Porcentaje con el guion largo cuando no hay dato.
 * @param {number | null} value - Porcentaje 0–100
 * @returns {string}
 */
export function formatPct(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return `${value.toFixed(percentDecimals)}%`;
}

/**
 * Profit factor; `null` significa que no hubo pérdidas y el cociente no existe.
 * @param {number | null} value - Profit factor
 * @returns {string}
 */
export function formatPf(value: number | null): string {
  if (value === null) {
    return '∞';
  }
  return value === 0 ? '—' : value.toFixed(pfDecimals);
}

/**
 * Clase de color del win rate según supere o no el 50%.
 * @param {number} winRate - Win rate 0–100
 * @returns {string}
 */
export function winRateClass(winRate: number): string {
  if (winRate === 0) {
    return 'text-fg-muted';
  }
  return winRate >= winRateBalance ? successClass : 'text-danger';
}

/**
 * Clase de color del profit factor.
 * @param {number | null} value - Profit factor
 * @returns {string}
 */
export function pfClass(value: number | null): string {
  if (value === null) {
    return successClass;
  }
  if (value === 0) {
    return 'text-fg-muted';
  }
  if (value >= strongPf) {
    return successClass;
  }
  return value >= breakEvenPf ? '' : 'text-danger';
}
