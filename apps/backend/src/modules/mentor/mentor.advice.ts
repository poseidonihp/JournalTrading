import { BadGatewayException } from '@nestjs/common';
import {
  MentorAdviceSchema,
  MentorAdviceStructureSchema,
  mentorAdviceLimits,
  type MentorAdvice,
  type MentorDigest,
  type MentorRef,
} from '@journal/shared-types';

const ellipsis = '…';
const minWordsPerField = 1;

/**
 * Convierte la respuesta cruda del proveedor en un consejo válido: parseo
 * estructural, verificación de referencias, recorte por campo y por palabras.
 * @param {string} raw - Contenido JSON devuelto por el modelo
 * @param {MentorDigest} digest - Digest contra el que se verifican las referencias
 * @returns {MentorAdvice}
 */
export function normalizeAdvice(raw: string, digest: MentorDigest): MentorAdvice {
  const parsed = MentorAdviceStructureSchema.safeParse(parseJson(raw));
  if (!parsed.success) {
    throw new BadGatewayException('El proveedor de IA devolvió un análisis con formato inválido');
  }

  const known = knownBuckets(digest);
  const draft = parsed.data;
  const advice: MentorAdvice = {
    diagnosis: {
      text: clamp(draft.diagnosis.text, mentorAdviceLimits.diagnosisChars),
      refs: keepKnownRefs(draft.diagnosis.refs, known),
    },
    leaks: draft.leaks
      .filter(leak => known.has(refKey(leak)))
      .slice(0, mentorAdviceLimits.maxLeaks)
      .map(leak => ({ ...leak, text: clamp(leak.text, mentorAdviceLimits.leakChars) })),
    eliminate: draft.eliminate
      .filter(item => known.has(refKey(item)))
      .slice(0, mentorAdviceLimits.maxEliminate)
      .map(item => ({ ...item, text: clamp(item.text, mentorAdviceLimits.eliminateChars) })),
    rules: draft.rules.slice(0, mentorAdviceLimits.maxRules).map(rule => ({
      text: clamp(rule.text, mentorAdviceLimits.ruleChars),
      refs: keepKnownRefs(rule.refs, known),
    })),
    focus: {
      text: clamp(draft.focus.text, mentorAdviceLimits.focusChars),
      refs: keepKnownRefs(draft.focus.refs, known),
    },
  };

  const trimmed = trimToWordBudget(advice, mentorAdviceLimits.maxWords);
  const validated = MentorAdviceSchema.safeParse(trimmed);
  if (!validated.success) {
    throw new BadGatewayException('El análisis generado no cumple el contrato esperado');
  }
  return validated.data;
}

/** Claves `dimensionId::bucketKey` que existen de verdad en el digest. */
export function knownBuckets(digest: MentorDigest): Set<string> {
  const keys = new Set<string>();
  for (const dimension of digest.dimensions) {
    for (const bucket of dimension.buckets) {
      keys.add(`${dimension.id}::${bucket.key}`);
    }
  }
  return keys;
}

function refKey(ref: MentorRef): string {
  return `${ref.dimensionId}::${ref.bucketKey}`;
}

/** Una referencia inexistente no puede presentarse como evidencia: se descarta. */
function keepKnownRefs(refs: readonly MentorRef[], known: Set<string>): MentorRef[] {
  return refs.filter(ref => known.has(refKey(ref)));
}

/**
 * Recorta en el último espacio para no partir una palabra. La elipsis cuenta
 * dentro del límite.
 * @param {string} text - Texto original
 * @param {number} maxChars - Tope de caracteres
 * @returns {string}
 */
export function clamp(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) {
    return clean;
  }
  const cut = clean.slice(0, maxChars - ellipsis.length);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}${ellipsis}`;
}

/** Contador determinista de palabras sobre un texto ya normalizado. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Palabras de todo el texto generado: es lo que limita el presupuesto. */
export function totalWords(advice: MentorAdvice): number {
  return textSlots(advice).reduce((total, slot) => total + countWords(slot.get()), 0);
}

/** Referencia mutable a un campo textual, para recortar sin duplicar lógica. */
interface ITextSlot {
  get: () => string;
  set: (value: string) => void;
}

/**
 * Campos textuales en el orden en que se recortan: primero el foco, después
 * reglas, fugas, eliminación y por último el diagnóstico.
 * @param {MentorAdvice} advice - Consejo a recortar
 * @returns {ITextSlot[]}
 */
function textSlots(advice: MentorAdvice): ITextSlot[] {
  const slots: ITextSlot[] = [
    { get: () => advice.focus.text, set: value => (advice.focus.text = value) },
  ];
  for (const list of [advice.rules, advice.leaks, advice.eliminate]) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const item = list[index];
      if (item) {
        slots.push({ get: () => item.text, set: value => (item.text = value) });
      }
    }
  }
  slots.push({
    get: () => advice.diagnosis.text,
    set: value => (advice.diagnosis.text = value),
  });
  return slots;
}

/**
 * Recorta palabras hasta caber en el presupuesto. No se reintenta la llamada:
 * el ajuste es local y determinista.
 * @param {MentorAdvice} advice - Consejo ya normalizado por campo
 * @param {number} maxWords - Presupuesto total de palabras
 * @returns {MentorAdvice}
 */
export function trimToWordBudget(advice: MentorAdvice, maxWords: number): MentorAdvice {
  const slots = textSlots(advice);
  let excess = totalWords(advice) - maxWords;
  for (const slot of slots) {
    if (excess <= 0) {
      break;
    }
    const words = slot.get().trim().split(/\s+/).filter(Boolean);
    const removable = Math.min(excess, words.length - minWordsPerField);
    if (removable > 0) {
      slot.set(words.slice(0, words.length - removable).join(' '));
      excess -= removable;
    }
  }
  return advice;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadGatewayException('El proveedor de IA devolvió una respuesta que no es JSON');
  }
}
