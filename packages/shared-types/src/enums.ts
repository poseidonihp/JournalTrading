import { z } from 'zod';

export const InstrumentCategoryEnum = z.enum(['FUTURE', 'CFD']);
export type InstrumentCategory = z.infer<typeof InstrumentCategoryEnum>;

export const TradeDirectionEnum = z.enum(['LONG', 'SHORT']);
export type TradeDirection = z.infer<typeof TradeDirectionEnum>;

export const ExitReasonEnum = z.enum(['TARGET', 'TRAILING_STOP', 'INITIAL_STOP', 'MANUAL']);
export type ExitReason = z.infer<typeof ExitReasonEnum>;

export const EmotionEnum = z.enum(['CONFIDENT', 'MISTAKE', 'PARAM_ERROR', 'EMOTIONAL_ERROR']);
export type Emotion = z.infer<typeof EmotionEnum>;

export const TradeSourceEnum = z.enum(['MANUAL', 'CSV', 'NINJATRADER']);
export type TradeSource = z.infer<typeof TradeSourceEnum>;

export const MediaKindEnum = z.enum(['IMAGE', 'VIDEO']);
export type MediaKind = z.infer<typeof MediaKindEnum>;

export const DataFeeFrequencyEnum = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']);
export type DataFeeFrequency = z.infer<typeof DataFeeFrequencyEnum>;

/**
 * Etiquetas en español para mostrar al usuario.
 * Mantener sincronizado con los enums del schema Prisma.
 */
export const enumLabels = {
  exitReason: {
    TARGET: 'Profit inicial',
    TRAILING_STOP: 'Trailing Stop',
    INITIAL_STOP: 'Stop inicial',
    MANUAL: 'Cierre manual',
  },
  emotion: {
    CONFIDENT: 'Seguridad',
    MISTAKE: 'Error',
    PARAM_ERROR: 'Error Parámetros',
    EMOTIONAL_ERROR: 'Error Emocional',
  },
  direction: {
    LONG: 'Long',
    SHORT: 'Short',
  },
  dataFeeFrequency: {
    MONTHLY: 'Mensual',
    QUARTERLY: 'Trimestral',
    ANNUAL: 'Anual',
  },
  /** Unidad en la que se miden los puntos según la categoría del instrumento. */
  pointsUnit: {
    FUTURE: 'pts',
    CFD: 'pips',
  },
} as const;
