import { describe, expect, it } from 'vitest';
import { Prisma } from '../../prisma/client';
import { mentorUnreviewedBucketKey } from '@journal/shared-types';
import { buildBehavior, buildEliminateCandidates, buildOverall } from './digest.behavior';
import { buildDimensions } from './digest.dimensions';
import { confidenceOf } from './digest.segments';
import { dateKeyUtc, profitFactorOf, winRateOf, zero } from './digest.stats';
import { resolvePeriod } from './digest.period';
import { enrichTrades } from './digest.trades';
import { applyContextBudget } from './digest.notes';
import { clamp, countWords } from './mentor.advice';
import { adviceJsonSchema } from './mentor.prompt';

const dec = (value: string): Prisma.Decimal => new Prisma.Decimal(value);

/** Fila cruda mínima para ejercitar `enrichTrades`. */
function row(overrides: {
  id: string;
  enteredAt: string;
  exitedAt?: string;
  points: string;
  net?: string;
  source?: string;
  contracts?: number;
}): Parameters<typeof enrichTrades>[0][number] {
  const enteredAt = new Date(overrides.enteredAt);
  return {
    id: overrides.id,
    enteredAt,
    exitedAt: new Date(overrides.exitedAt ?? overrides.enteredAt),
    durationSeconds: 120,
    contracts: overrides.contracts ?? 1,
    direction: 'LONG',
    exitReason: 'TARGET',
    emotion: 'CONFIDENT',
    source: overrides.source ?? 'MANUAL',
    entryReason: 'setup',
    notes: null,
    gross: dec(overrides.net ?? overrides.points),
    commission: zero,
    net: dec(overrides.net ?? overrides.points),
    pointsTotal: dec(overrides.points),
    tradeTypeId: 'tt-1',
    tradeType: { name: 'Breakout' },
    instrumentId: 'in-1',
    instrument: { symbol: 'MNQ' },
  };
}

describe('digest.stats', () => {
  it('deja los scratch fuera del denominador del win rate', () => {
    expect(winRateOf(3, 1)).toBe(75);
    expect(winRateOf(0, 0)).toBe(0);
  });

  it('devuelve null en profit factor cuando hay ganancias y ninguna pérdida', () => {
    expect(profitFactorOf(dec('100'), zero)).toBeNull();
    expect(profitFactorOf(zero, zero)).toBe(0);
    expect(profitFactorOf(dec('150'), dec('-50'))).toBe(3);
  });

  it('agrupa por día UTC, no por hora local', () => {
    expect(dateKeyUtc(new Date('2026-03-01T00:30:00.000Z'))).toBe('2026-03-01');
    expect(dateKeyUtc(new Date('2026-02-28T23:30:00.000Z'))).toBe('2026-02-28');
  });
});

describe('confidenceOf', () => {
  it('escala por tamaño de muestra', () => {
    expect(confidenceOf(30, null)).toBe('HIGH');
    expect(confidenceOf(10, null)).toBe('MEDIUM');
    expect(confidenceOf(9, null)).toBe('LOW');
  });

  it('degrada un nivel si un solo trade explica más de la mitad del P&L absoluto', () => {
    expect(confidenceOf(40, 60)).toBe('MEDIUM');
    expect(confidenceOf(12, 80)).toBe('LOW');
    expect(confidenceOf(40, 50)).toBe('HIGH');
  });
});

describe('enrichTrades', () => {
  const trades = enrichTrades([
    row({
      id: 'a',
      enteredAt: '2026-03-02T13:00:00.000Z',
      exitedAt: '2026-03-02T13:02:00.000Z',
      points: '-5',
    }),
    row({
      id: 'b',
      enteredAt: '2026-03-02T13:05:00.000Z',
      exitedAt: '2026-03-02T13:06:00.000Z',
      points: '-4',
    }),
    row({ id: 'c', enteredAt: '2026-03-02T13:10:00.000Z', points: '8' }),
    row({ id: 'd', enteredAt: '2026-03-03T13:00:00.000Z', points: '3' }),
  ]);

  it('numera los trades dentro de cada día UTC', () => {
    expect(trades.map(trade => trade.ordinalOfDay)).toEqual([1, 2, 3, 1]);
  });

  it('clasifica el resultado previo sin acumular categorías', () => {
    expect(trades.map(trade => trade.priorOutcome)).toEqual([
      'FIRST_OF_DAY',
      'AFTER_ONE_LOSS',
      'AFTER_TWO_PLUS_LOSSES',
      'FIRST_OF_DAY',
    ]);
  });

  it('mide el hueco hasta la siguiente entrada sólo dentro del día', () => {
    expect(trades[0]?.secondsToNext).toBe(180);
    expect(trades[2]?.secondsToNext).toBeNull();
    expect(trades[3]?.secondsToNext).toBeNull();
  });
});

describe('buildDimensions', () => {
  const trades = enrichTrades([
    row({ id: 'a', enteredAt: '2026-03-02T13:00:00.000Z', points: '-5', contracts: 1 }),
    row({ id: 'b', enteredAt: '2026-03-02T14:00:00.000Z', points: '9', contracts: 7 }),
    row({ id: 'c', enteredAt: '2026-03-03T13:00:00.000Z', points: '2', source: 'NINJATRADER' }),
  ]);
  const dimensions = buildDimensions(trades);

  it('produce una partición en las 11 dimensiones', () => {
    expect(dimensions).toHaveLength(11);
    for (const dimension of dimensions) {
      const total = dimension.buckets.reduce((sum, bucket) => sum + bucket.trades, 0);
      expect(total).toBe(trades.length);
    }
  });

  it('manda los importados al bucket UNREVIEWED de emoción y salida', () => {
    const emotion = dimensions.find(dimension => dimension.id === 'EMOTION');
    const unreviewed = emotion?.buckets.find(bucket => bucket.key === mentorUnreviewedBucketKey);
    expect(unreviewed?.trades).toBe(1);
  });

  it('respeta las fronteras de los tramos de contratos', () => {
    const contracts = dimensions.find(dimension => dimension.id === 'CONTRACTS');
    expect(contracts?.buckets.map(bucket => bucket.key).sort()).toEqual(['1', '6-10']);
  });
});

describe('buildOverall', () => {
  const trades = enrichTrades([
    row({ id: 'a', enteredAt: '2026-03-02T13:00:00.000Z', points: '-5', net: '-100' }),
    row({ id: 'b', enteredAt: '2026-03-02T14:00:00.000Z', points: '9', net: '300' }),
  ]);

  it('separa el neto antes y después del fee de data', () => {
    const overall = buildOverall(trades, dec('50'));
    expect(overall.netBeforeDataFees).toBe('200.00');
    expect(overall.netAfterDataFees).toBe('150.00');
    expect(overall.dataFees).toBe('50.00');
  });

  it('no imputa el fee a los buckets', () => {
    const dimensions = buildDimensions(trades);
    const direction = dimensions.find(dimension => dimension.id === 'DIRECTION');
    const long = direction?.buckets.find(bucket => bucket.key === 'LONG');
    expect(long?.netBeforeDataFees).toBe('200.00');
  });
});

describe('buildEliminateCandidates', () => {
  it('sólo propone buckets perdedores con confianza suficiente', () => {
    const dimensions = [
      {
        id: 'EMOTION' as const,
        label: 'Emoción',
        buckets: [
          bucket('MISTAKE', '-400', 'HIGH'),
          bucket('CONFIDENT', '900', 'HIGH'),
          bucket('PARAM_ERROR', '-90', 'LOW'),
          bucket(mentorUnreviewedBucketKey, '-500', 'HIGH'),
        ],
      },
    ];
    const candidates = buildEliminateCandidates(dimensions, '500.00', 120);
    expect(candidates.map(candidate => candidate.bucketKey)).toEqual(['MISTAKE']);
    expect(candidates[0]?.netWithoutBucket).toBe('900.00');
    expect(candidates[0]?.delta).toBe('400.00');
  });

  it('descarta el bucket que abarca todo el periodo: eso sería dejar de operar', () => {
    const dimensions = [
      {
        id: 'INSTRUMENT' as const,
        label: 'Instrumento',
        buckets: [bucket('MNQ', '-400', 'HIGH')],
      },
    ];
    expect(buildEliminateCandidates(dimensions, '-400.00', 30)).toHaveLength(0);
    expect(buildEliminateCandidates(dimensions, '-400.00', 31)).toHaveLength(1);
  });
});

describe('buildBehavior', () => {
  it('mide la disciplina sólo sobre los trades cargados a mano', () => {
    const trades = enrichTrades([
      row({ id: 'a', enteredAt: '2026-03-02T13:00:00.000Z', points: '4' }),
      row({ id: 'b', enteredAt: '2026-03-02T14:00:00.000Z', points: '4', source: 'NINJATRADER' }),
    ]);
    const behavior = buildBehavior(trades);
    expect(behavior.discipline.targetExitPct).toBe(100);
    expect(behavior.discipline.reviewedPct).toBe(50);
  });
});

describe('resolvePeriod', () => {
  it('recorta «todo» al último trade y no a now()', () => {
    const trades = enrichTrades([
      row({ id: 'a', enteredAt: '2026-01-05T13:00:00.000Z', points: '1' }),
      row({ id: 'b', enteredAt: '2026-02-09T13:00:00.000Z', points: '1' }),
    ]);
    const period = resolvePeriod({}, trades);
    expect(period.from).toBe('2026-01-05T13:00:00.000Z');
    expect(period.to).toBe('2026-02-09T13:00:00.000Z');
  });

  it('usa el mes completo en UTC', () => {
    const period = resolvePeriod({ month: '2026-02' }, []);
    expect(period.from).toBe('2026-02-01T00:00:00.000Z');
    expect(period.to).toBe('2026-02-28T23:59:59.999Z');
    expect(period.label).toBe('Febrero 2026');
  });
});

describe('applyContextBudget', () => {
  it('recorta la serie diaria antes que el texto libre', () => {
    const digest = digestFixture();
    const budget = JSON.stringify(digest).length - 2000;
    const trimmed = applyContextBudget(digest, budget);
    expect(trimmed.daily.length).toBeLessThan(digest.daily.length);
    expect(trimmed.truncation.daily).toBe(true);
    expect(trimmed.notes.truncated).toBe(false);
  });
});

describe('normalización del consejo', () => {
  it('recorta en el último espacio y cuenta la elipsis dentro del límite', () => {
    const trimmed = clamp('palabra larguisima que no cabe entera', 20);
    expect(trimmed.length).toBeLessThanOrEqual(20);
    expect(trimmed.endsWith('…')).toBe(true);
    expect(trimmed).not.toContain('larguisim…');
  });

  it('cuenta palabras de forma determinista', () => {
    expect(countWords('  dos   palabras  ')).toBe(2);
    expect(countWords('')).toBe(0);
  });
});

describe('adviceJsonSchema', () => {
  it('cierra los objetos y exige todas las claves, como pide Structured Outputs', () => {
    const schema = adviceJsonSchema();
    expect(schema['$schema']).toBeUndefined();
    expect(schema['additionalProperties']).toBe(false);
    expect(schema['required']).toEqual(['diagnosis', 'leaks', 'eliminate', 'rules', 'focus']);
    expect(JSON.stringify(schema)).not.toContain('maxLength');
  });
});

function bucket(
  key: string,
  net: string,
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
): Parameters<typeof buildEliminateCandidates>[0][number]['buckets'][number] {
  return {
    key,
    label: key,
    trades: 30,
    wins: 10,
    losses: 20,
    breakEven: 0,
    netBeforeDataFees: net,
    winRate: 33,
    avgWin: '0.00',
    avgLoss: '0.00',
    expectancy: '0.00',
    profitFactor: 1,
    sharePct: 50,
    topTradeConcentrationPct: 10,
    confidence,
  };
}

/** Digest sintético con serie diaria larga, para ejercitar la degradación. */
function digestFixture(): Parameters<typeof applyContextBudget>[0] {
  const trades = enrichTrades([
    row({ id: 'a', enteredAt: '2026-03-02T13:00:00.000Z', points: '4' }),
  ]);
  const dimensions = buildDimensions(trades);
  const overall = buildOverall(trades, zero);
  return {
    digestVersion: 1,
    generatedAt: '2026-03-03T00:00:00.000Z',
    period: resolvePeriod({}, trades),
    accountIds: ['acc-1'],
    accountSetKey: 'acc-1',
    accountLabel: 'Principal',
    currency: 'USD',
    mixedCurrencies: false,
    overall,
    dimensions,
    behavior: buildBehavior(trades),
    eliminateCandidates: [],
    daily: Array.from({ length: 400 }, (_, index) => ({
      date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      trades: 3,
      net: '10.00',
      winRate: 50,
    })),
    monthly: [],
    notes: { trades: [], sessions: [], truncated: false },
    sourceMix: { manual: 1, imported: 0, importedPct: 0 },
    previousAdvice: null,
    dataGaps: [],
    truncation: { daily: false, monthly: false, notes: false },
  };
}
