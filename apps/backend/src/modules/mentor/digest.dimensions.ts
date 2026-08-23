import {
  enumLabels,
  mentorDimensionLabels,
  mentorUnreviewedBucketKey,
  type Emotion,
  type ExitReason,
  type MentorDimension,
  type TradeDirection,
} from '@journal/shared-types';
import {
  fixedOrder,
  numericOrder,
  buildDimension,
  type IDimensionDefinition,
} from './digest.segments';
import type { IDigestTrade } from './digest.stats';

const secondsPerMinute = 60;
const durationOneMinute = secondsPerMinute;
const durationFiveMinutes = 5 * secondsPerMinute;
const durationFifteenMinutes = 15 * secondsPerMinute;
const durationSixtyMinutes = 60 * secondsPerMinute;
const hourDigits = 2;

/** Etiquetas de los tramos de contratos; las fronteras no se solapan. */
const contractBuckets = ['1', '2', '3', '4-5', '6-10', '11+'] as const;
const contractsThreeMax = 3;
const contractsFiveMax = 5;
const contractsTenMax = 10;

/** Tramos de duración, semiabiertos por la derecha. */
const durationBuckets = ['LT_1M', 'M1_5', 'M5_15', 'M15_60', 'GTE_60M'] as const;
const durationLabels: Record<string, string> = {
  LT_1M: 'Menos de 1 min',
  M1_5: '1–5 min',
  M5_15: '5–15 min',
  M15_60: '15–60 min',
  GTE_60M: '60 min o más',
};

const ordinalBuckets = ['1', '2', '3', '4', '5', '6+'] as const;
const ordinalSixPlus = 6;

const priorOutcomeBuckets = [
  'FIRST_OF_DAY',
  'AFTER_WIN',
  'AFTER_ONE_LOSS',
  'AFTER_TWO_PLUS_LOSSES',
] as const;
const priorOutcomeLabels: Record<string, string> = {
  FIRST_OF_DAY: 'Primero del día',
  AFTER_WIN: 'Tras ganar o scratch',
  AFTER_ONE_LOSS: 'Tras una pérdida',
  AFTER_TWO_PLUS_LOSSES: 'Tras dos o más pérdidas',
};

const weekdayLabels = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

const unreviewedLabel = 'Sin revisar (importado)';

/**
 * Un trade importado por CSV no aporta observación de emoción ni de salida:
 * `imports.service.ts` les asigna CONFIDENT y MANUAL como relleno.
 * @param {IDigestTrade} trade - Trade a evaluar
 * @returns {boolean}
 */
function isUnreviewed(trade: IDigestTrade): boolean {
  return trade.source !== 'MANUAL';
}

function tramoContratos(contracts: number): string {
  if (contracts <= contractsThreeMax) {
    return String(contracts);
  }
  if (contracts <= contractsFiveMax) {
    return '4-5';
  }
  return contracts <= contractsTenMax ? '6-10' : '11+';
}

function tramoDuracion(seconds: number): string {
  if (seconds < durationOneMinute) {
    return 'LT_1M';
  }
  if (seconds < durationFiveMinutes) {
    return 'M1_5';
  }
  if (seconds < durationFifteenMinutes) {
    return 'M5_15';
  }
  return seconds < durationSixtyMinutes ? 'M15_60' : 'GTE_60M';
}

/**
 * Las 11 definiciones de corte. Cada una es una partición: todo trade cae en
 * exactamente un bucket.
 * @returns {IDimensionDefinition[]}
 */
export function dimensionDefinitions(): IDimensionDefinition[] {
  return [
    {
      id: 'TRADE_TYPE',
      label: mentorDimensionLabels.TRADE_TYPE,
      bucketOf: trade => trade.tradeTypeId,
      labelOf: () => '',
    },
    {
      id: 'EMOTION',
      label: mentorDimensionLabels.EMOTION,
      bucketOf: trade => (isUnreviewed(trade) ? mentorUnreviewedBucketKey : trade.emotion),
      labelOf: key =>
        key === mentorUnreviewedBucketKey
          ? unreviewedLabel
          : (enumLabels.emotion[key as Emotion] ?? key),
      order: fixedOrder([...Object.keys(enumLabels.emotion), mentorUnreviewedBucketKey]),
    },
    {
      id: 'EXIT_REASON',
      label: mentorDimensionLabels.EXIT_REASON,
      bucketOf: trade => (isUnreviewed(trade) ? mentorUnreviewedBucketKey : trade.exitReason),
      labelOf: key =>
        key === mentorUnreviewedBucketKey
          ? unreviewedLabel
          : (enumLabels.exitReason[key as ExitReason] ?? key),
      order: fixedOrder([...Object.keys(enumLabels.exitReason), mentorUnreviewedBucketKey]),
    },
    {
      id: 'DIRECTION',
      label: mentorDimensionLabels.DIRECTION,
      bucketOf: trade => trade.direction,
      labelOf: key => enumLabels.direction[key as TradeDirection] ?? key,
      order: fixedOrder(Object.keys(enumLabels.direction)),
    },
    {
      id: 'INSTRUMENT',
      label: mentorDimensionLabels.INSTRUMENT,
      bucketOf: trade => trade.instrumentSymbol,
      labelOf: key => key,
    },
    {
      id: 'HOUR',
      label: mentorDimensionLabels.HOUR,
      bucketOf: trade => String(trade.enteredAt.getUTCHours()),
      labelOf: key => `${key.padStart(hourDigits, '0')}:00 UTC`,
      order: numericOrder,
    },
    {
      id: 'WEEKDAY',
      label: mentorDimensionLabels.WEEKDAY,
      bucketOf: trade => String(trade.enteredAt.getUTCDay()),
      labelOf: key => weekdayLabels[Number(key)] ?? key,
      order: numericOrder,
    },
    {
      id: 'CONTRACTS',
      label: mentorDimensionLabels.CONTRACTS,
      bucketOf: trade => tramoContratos(trade.contracts),
      labelOf: key => `${key} contratos`,
      order: fixedOrder(contractBuckets),
    },
    {
      id: 'DURATION',
      label: mentorDimensionLabels.DURATION,
      bucketOf: trade => tramoDuracion(trade.durationSeconds),
      labelOf: key => durationLabels[key] ?? key,
      order: fixedOrder(durationBuckets),
    },
    {
      id: 'TRADE_ORDINAL',
      label: mentorDimensionLabels.TRADE_ORDINAL,
      bucketOf: trade => (trade.ordinalOfDay >= ordinalSixPlus ? '6+' : String(trade.ordinalOfDay)),
      labelOf: key => (key === '6+' ? 'Sexto o posterior del día' : `Trade #${key} del día`),
      order: fixedOrder(ordinalBuckets),
    },
    {
      id: 'PRIOR_OUTCOME',
      label: mentorDimensionLabels.PRIOR_OUTCOME,
      bucketOf: trade => trade.priorOutcome,
      labelOf: key => priorOutcomeLabels[key] ?? key,
      order: fixedOrder(priorOutcomeBuckets),
    },
  ];
}

/**
 * Construye las 11 dimensiones. Los tipos de trade se etiquetan con el nombre
 * que el usuario les puso, que sólo se conoce con los trades a la vista.
 * @param {readonly IDigestTrade[]} trades - Trades del periodo
 * @returns {MentorDimension[]}
 */
export function buildDimensions(trades: readonly IDigestTrade[]): MentorDimension[] {
  const tradeTypeNames = new Map(trades.map(trade => [trade.tradeTypeId, trade.tradeTypeName]));
  return dimensionDefinitions().map(definition => {
    const resolved: IDimensionDefinition =
      definition.id === 'TRADE_TYPE'
        ? { ...definition, labelOf: key => tradeTypeNames.get(key) ?? key }
        : definition;
    return buildDimension(resolved, trades);
  });
}
