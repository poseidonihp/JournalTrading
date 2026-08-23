import { describe, expect, it } from 'vitest';
import { mentorAdviceLimits, type MentorAdvice, type MentorDigest } from '@journal/shared-types';
import { normalizeAdvice, totalWords, trimToWordBudget } from './mentor.advice';

/** Digest mínimo con los buckets que las referencias deben poder resolver. */
const digest = {
  dimensions: [
    { id: 'DIRECTION', label: 'Dirección', buckets: [{ key: 'LONG' }, { key: 'SHORT' }] },
    { id: 'EMOTION', label: 'Emoción', buckets: [{ key: 'MISTAKE' }] },
  ],
} as unknown as MentorDigest;

/** Consejo válido al que se le puede cambiar un campo por prueba. */
function advice(overrides: Partial<MentorAdvice> = {}): MentorAdvice {
  return {
    diagnosis: {
      text: 'Pierdes en short.',
      refs: [{ dimensionId: 'DIRECTION', bucketKey: 'SHORT' }],
    },
    leaks: [{ dimensionId: 'EMOTION', bucketKey: 'MISTAKE', text: 'Entras sin plan.' }],
    eliminate: [
      { dimensionId: 'DIRECTION', bucketKey: 'SHORT', text: 'Habrías cerrado en verde.' },
    ],
    rules: [{ text: 'Sólo long antes de las 15h.', refs: [] }],
    focus: { text: 'Una operación por señal.', refs: [] },
    ...overrides,
  };
}

describe('trimToWordBudget', () => {
  it('recorta cuando las palabras son muy cortas aunque quepan en caracteres', () => {
    const many = Array.from({ length: 120 }, () => 'a').join(' ');
    const draft = advice({
      focus: { text: many, refs: [] },
      rules: [{ text: many, refs: [] }],
    });
    expect(totalWords(draft)).toBeGreaterThan(mentorAdviceLimits.maxWords);

    const trimmed = trimToWordBudget(draft, mentorAdviceLimits.maxWords);
    expect(totalWords(trimmed)).toBeLessThanOrEqual(mentorAdviceLimits.maxWords);
  });

  it('empieza por el foco y deja el diagnóstico intacto', () => {
    const diagnosis = 'Uno dos tres cuatro cinco seis siete ocho nueve diez';
    const draft = advice({
      diagnosis: { text: diagnosis, refs: [] },
      focus: { text: Array.from({ length: 100 }, () => 'x').join(' '), refs: [] },
    });
    const trimmed = trimToWordBudget(draft, 40);
    expect(trimmed.diagnosis.text).toBe(diagnosis);
    expect(totalWords(trimmed)).toBeLessThanOrEqual(40);
  });

  it('nunca deja un campo vacío', () => {
    const draft = advice({ focus: { text: 'uno dos tres', refs: [] } });
    const trimmed = trimToWordBudget(draft, 1);
    expect(trimmed.focus.text.length).toBeGreaterThan(0);
    expect(trimmed.diagnosis.text.length).toBeGreaterThan(0);
  });
});

describe('normalizeAdvice', () => {
  it('aplica los máximos de array después del parseo', () => {
    const raw = JSON.stringify({
      ...advice(),
      leaks: Array.from({ length: 5 }, () => ({
        dimensionId: 'EMOTION',
        bucketKey: 'MISTAKE',
        text: 'fuga',
      })),
      rules: Array.from({ length: 5 }, () => ({ text: 'regla', refs: [] })),
      eliminate: Array.from({ length: 4 }, () => ({
        dimensionId: 'DIRECTION',
        bucketKey: 'SHORT',
        text: 'quitar',
      })),
    });
    const result = normalizeAdvice(raw, digest);
    expect(result.leaks).toHaveLength(mentorAdviceLimits.maxLeaks);
    expect(result.rules).toHaveLength(mentorAdviceLimits.maxRules);
    expect(result.eliminate).toHaveLength(mentorAdviceLimits.maxEliminate);
  });

  it('descarta referencias y hallazgos que no existen en el digest', () => {
    const raw = JSON.stringify({
      ...advice(),
      diagnosis: {
        text: 'Algo',
        refs: [
          { dimensionId: 'DIRECTION', bucketKey: 'LONG' },
          { dimensionId: 'HOUR', bucketKey: '99' },
        ],
      },
      leaks: [{ dimensionId: 'EMOTION', bucketKey: 'INVENTADO', text: 'fuga falsa' }],
    });
    const result = normalizeAdvice(raw, digest);
    expect(result.diagnosis.refs).toEqual([{ dimensionId: 'DIRECTION', bucketKey: 'LONG' }]);
    expect(result.leaks).toHaveLength(0);
  });

  it('respeta el tope de caracteres de cada campo', () => {
    const raw = JSON.stringify({
      ...advice(),
      diagnosis: { text: 'palabra '.repeat(200), refs: [] },
      focus: { text: 'palabra '.repeat(200), refs: [] },
    });
    const result = normalizeAdvice(raw, digest);
    expect(result.diagnosis.text.length).toBeLessThanOrEqual(mentorAdviceLimits.diagnosisChars);
    expect(result.focus.text.length).toBeLessThanOrEqual(mentorAdviceLimits.focusChars);
  });

  it('rechaza una respuesta que no es JSON', () => {
    expect(() => normalizeAdvice('no soy json', digest)).toThrow();
  });
});
