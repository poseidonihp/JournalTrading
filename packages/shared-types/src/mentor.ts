import { z } from 'zod';

// ---------------------------------------------------------------------------
// Dimensiones del digest
// ---------------------------------------------------------------------------

export const MentorDimensionIdEnum = z.enum([
  'TRADE_TYPE',
  'EMOTION',
  'EXIT_REASON',
  'DIRECTION',
  'INSTRUMENT',
  'HOUR',
  'WEEKDAY',
  'CONTRACTS',
  'DURATION',
  'TRADE_ORDINAL',
  'PRIOR_OUTCOME',
]);
export type MentorDimensionId = z.infer<typeof MentorDimensionIdEnum>;

/**
 * Etiquetas de las dimensiones. No van en `enumLabels` porque ese mapa refleja
 * enums de Prisma y `MentorDimensionId` no lo es.
 */
export const mentorDimensionLabels: Record<MentorDimensionId, string> = {
  TRADE_TYPE: 'Tipo de trade',
  EMOTION: 'Emoción',
  EXIT_REASON: 'Motivo de salida',
  DIRECTION: 'Dirección',
  INSTRUMENT: 'Instrumento',
  HOUR: 'Hora (UTC)',
  WEEKDAY: 'Día de la semana',
  CONTRACTS: 'Contratos',
  DURATION: 'Duración',
  TRADE_ORDINAL: 'Orden del día',
  PRIOR_OUTCOME: 'Resultado previo',
};

/** Bucket de los trades que no aportan una observación válida de esa dimensión. */
export const mentorUnreviewedBucketKey = 'UNREVIEWED';

export const MentorConfidenceEnum = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export type MentorConfidence = z.infer<typeof MentorConfidenceEnum>;

/** Resultado de la operación anterior del mismo día; nunca acumulativo. */
export const MentorPriorOutcomeEnum = z.enum([
  'FIRST_OF_DAY',
  'AFTER_WIN',
  'AFTER_ONE_LOSS',
  'AFTER_TWO_PLUS_LOSSES',
]);
export type MentorPriorOutcome = z.infer<typeof MentorPriorOutcomeEnum>;

// ---------------------------------------------------------------------------
// Digest determinista
// ---------------------------------------------------------------------------

export const MentorBucketSchema = z.object({
  key: z.string(),
  label: z.string(),
  trades: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  /** Trades dentro del umbral de scratch; no entran en winRate ni en profitFactor. */
  breakEven: z.number().int().nonnegative(),
  /** El fee de data no es imputable a un bucket: nunca está descontado aquí. */
  netBeforeDataFees: z.string(),
  winRate: z.number(),
  avgWin: z.string(),
  avgLoss: z.string(),
  /** Neto medio por trade del bucket, antes del fee de data. */
  expectancy: z.string(),
  /** null cuando no hay pérdidas pero sí ganancias, igual que en Insights. */
  profitFactor: z.number().nullable(),
  /** Peso del bucket sobre el P&L absoluto de la dimensión; null si ese total es 0. */
  sharePct: z.number().nullable(),
  /** Cuánto del P&L absoluto del bucket explica un solo trade; null si es 0. */
  topTradeConcentrationPct: z.number().nullable(),
  confidence: MentorConfidenceEnum,
});
export type MentorBucket = z.infer<typeof MentorBucketSchema>;

export const MentorDimensionSchema = z.object({
  id: MentorDimensionIdEnum,
  label: z.string(),
  buckets: z.array(MentorBucketSchema),
});
export type MentorDimension = z.infer<typeof MentorDimensionSchema>;

export const MentorOverallSchema = z.object({
  trades: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  breakEven: z.number().int().nonnegative(),
  grossPnl: z.string(),
  commission: z.string(),
  /** Suma de los netos de los trades, sin tocar el fee de data. */
  netBeforeDataFees: z.string(),
  /** netBeforeDataFees − dataFees. Es el neto que muestra el dashboard. */
  netAfterDataFees: z.string(),
  /** Fee de data del periodo, como costo positivo. */
  dataFees: z.string(),
  winRate: z.number(),
  profitFactor: z.number().nullable(),
  expectancy: z.string(),
  avgWin: z.string(),
  avgLoss: z.string(),
  largestWin: z.string(),
  largestLoss: z.string(),
  avgDurationSeconds: z.number().int().nonnegative(),
  tradingDays: z.number().int().nonnegative(),
  avgTradesPerDay: z.number(),
  bestDayNet: z.string(),
  worstDayNet: z.string(),
});
export type MentorOverall = z.infer<typeof MentorOverallSchema>;

export const MentorBehaviorSchema = z.object({
  overtrading: z.object({
    avgTradesPerDay: z.number(),
    maxTradesInDay: z.number().int().nonnegative(),
    /** Días con más trades que la media del periodo. */
    highVolumeDays: z.number().int().nonnegative(),
    netOnHighVolumeDays: z.string(),
    netOnNormalVolumeDays: z.string(),
  }),
  tilt: z.object({
    netAfterWin: z.string(),
    netAfterLoss: z.string(),
    avgContractsAfterWin: z.number(),
    avgContractsAfterLoss: z.number(),
    /** Segundos hasta la siguiente entrada del mismo día; null sin muestra. */
    avgSecondsToNextAfterWin: z.number().int().nonnegative().nullable(),
    avgSecondsToNextAfterLoss: z.number().int().nonnegative().nullable(),
  }),
  discipline: z.object({
    manualExitPct: z.number(),
    initialStopPct: z.number(),
    targetExitPct: z.number(),
    withoutEntryReasonPct: z.number(),
    /** Cuota de trades cargados a mano, con emoción y salida reales. */
    reviewedPct: z.number(),
  }),
});
export type MentorBehavior = z.infer<typeof MentorBehaviorSchema>;

export const MentorTradeNoteSchema = z.object({
  tradeId: z.string(),
  /** Día UTC de `enteredAt`. */
  date: z.string(),
  net: z.string(),
  /** null cuando el trade es importado: el valor guardado es relleno, no dato. */
  emotion: z.string().nullable(),
  exitReason: z.string().nullable(),
  entryReason: z.string().nullable(),
  notes: z.string().nullable(),
});
export type MentorTradeNote = z.infer<typeof MentorTradeNoteSchema>;

export const MentorSessionNoteSchema = z.object({
  date: z.string(),
  mood: z.string().nullable(),
  notes: z.string(),
});
export type MentorSessionNote = z.infer<typeof MentorSessionNoteSchema>;

export const MentorNotesSchema = z.object({
  trades: z.array(MentorTradeNoteSchema),
  sessions: z.array(MentorSessionNoteSchema),
  /** true si el presupuesto de contexto obligó a recortar texto libre. */
  truncated: z.boolean(),
});
export type MentorNotes = z.infer<typeof MentorNotesSchema>;

export const MentorDailySchema = z.object({
  date: z.string(),
  trades: z.number().int().nonnegative(),
  net: z.string(),
  winRate: z.number(),
});
export type MentorDaily = z.infer<typeof MentorDailySchema>;

export const MentorMonthlySchema = z.object({
  month: z.string(),
  trades: z.number().int().nonnegative(),
  net: z.string(),
  winRate: z.number(),
});
export type MentorMonthly = z.infer<typeof MentorMonthlySchema>;

export const MentorSourceMixSchema = z.object({
  manual: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  importedPct: z.number(),
});
export type MentorSourceMix = z.infer<typeof MentorSourceMixSchema>;

/**
 * Contrafáctico determinista por bucket: qué habría quedado sin sus trades.
 * Sólo se listan buckets elegibles (confianza HIGH o MEDIUM y P&L negativo).
 */
export const MentorEliminateCandidateSchema = z.object({
  dimensionId: MentorDimensionIdEnum,
  bucketKey: z.string(),
  label: z.string(),
  dimensionLabel: z.string(),
  trades: z.number().int().nonnegative(),
  netBeforeDataFees: z.string(),
  /** Neto del periodo sin los trades del bucket, antes del fee de data. */
  netWithoutBucket: z.string(),
  /** netWithoutBucket − overall.netBeforeDataFees. Siempre positivo aquí. */
  delta: z.string(),
  confidence: MentorConfidenceEnum,
});
export type MentorEliminateCandidate = z.infer<typeof MentorEliminateCandidateSchema>;

export const MentorPreviousAdviceSchema = z.object({
  reportId: z.string(),
  periodLabel: z.string(),
  diagnosis: z.string(),
  rules: z.array(z.string()),
  focus: z.string(),
});
export type MentorPreviousAdvice = z.infer<typeof MentorPreviousAdviceSchema>;

export const MentorPeriodSchema = z.object({
  label: z.string(),
  from: z.string(),
  to: z.string(),
  month: z.string().nullable(),
  year: z.number().int().nullable(),
});
export type MentorPeriod = z.infer<typeof MentorPeriodSchema>;

export const MentorDigestSchema = z.object({
  digestVersion: z.number().int(),
  generatedAt: z.string(),
  period: MentorPeriodSchema,
  accountIds: z.array(z.string()),
  accountSetKey: z.string(),
  accountLabel: z.string(),
  currency: z.string(),
  /** true si el alcance mezcla monedas distintas: bloquea la generación. */
  mixedCurrencies: z.boolean(),
  overall: MentorOverallSchema,
  dimensions: z.array(MentorDimensionSchema),
  behavior: MentorBehaviorSchema,
  eliminateCandidates: z.array(MentorEliminateCandidateSchema),
  daily: z.array(MentorDailySchema),
  monthly: z.array(MentorMonthlySchema),
  notes: MentorNotesSchema,
  sourceMix: MentorSourceMixSchema,
  previousAdvice: MentorPreviousAdviceSchema.nullable(),
  /** Lo que el journal NO registra, para que el modelo no lo invente. */
  dataGaps: z.array(z.string()),
  truncation: z.object({
    daily: z.boolean(),
    monthly: z.boolean(),
    notes: z.boolean(),
  }),
});
export type MentorDigest = z.infer<typeof MentorDigestSchema>;

/** Lo que el journal no guarda hoy; se envía tal cual dentro del digest. */
export const mentorDataGaps: readonly string[] = [
  'No hay precio de entrada ni de salida.',
  'No hay stop ni target planificados: no existe R-múltiplo ni ratio riesgo/beneficio.',
  'No hay MAE ni MFE: no se puede medir cuánto se devolvió de un ganador.',
  'No hay comparación entre lo planeado y lo ejecutado.',
  'Las horas y los días son UTC, no la hora local del trader.',
];

// ---------------------------------------------------------------------------
// Consejo generado por el modelo
// ---------------------------------------------------------------------------

/**
 * Topes por campo. La suma da ~1180 caracteres, del orden de 200 palabras.
 * No se envían al proveedor: viven en el prompt y en la normalización local.
 */
export const mentorAdviceLimits = {
  diagnosisChars: 240,
  leakChars: 120,
  eliminateChars: 120,
  ruleChars: 80,
  focusChars: 100,
  maxLeaks: 3,
  maxEliminate: 2,
  maxRules: 3,
  /** Presupuesto duro sobre la suma de todo el texto generado. */
  maxWords: 200,
} as const;

export const MentorRefSchema = z.object({
  dimensionId: MentorDimensionIdEnum,
  bucketKey: z.string(),
});
export type MentorRef = z.infer<typeof MentorRefSchema>;

/** Afirmación con las referencias al digest que la sostienen. */
export const MentorStatementStructureSchema = z.object({
  text: z.string(),
  refs: z.array(MentorRefSchema),
});

/** Fuga o candidato a eliminar: el bucket es la referencia y aporta las cifras. */
export const MentorFindingStructureSchema = z.object({
  dimensionId: MentorDimensionIdEnum,
  bucketKey: z.string(),
  text: z.string(),
});

/**
 * Contrato estructural, sin límites de longitud: es con el que se parsea la
 * respuesta cruda del proveedor y del que se deriva su JSON Schema.
 */
export const MentorAdviceStructureSchema = z.object({
  diagnosis: MentorStatementStructureSchema,
  leaks: z.array(MentorFindingStructureSchema),
  eliminate: z.array(MentorFindingStructureSchema),
  rules: z.array(MentorStatementStructureSchema),
  focus: MentorStatementStructureSchema,
});
export type MentorAdviceStructure = z.infer<typeof MentorAdviceStructureSchema>;

export const MentorStatementSchema = MentorStatementStructureSchema.extend({
  text: z.string().min(1),
});
export type MentorStatement = z.infer<typeof MentorStatementSchema>;

export const MentorFindingSchema = MentorFindingStructureSchema.extend({
  text: z.string().min(1).max(mentorAdviceLimits.leakChars),
});
export type MentorFinding = z.infer<typeof MentorFindingSchema>;

/** Contrato de dominio: se valida después de normalizar, y es lo que se persiste. */
export const MentorAdviceSchema = z.object({
  diagnosis: MentorStatementSchema.extend({
    text: z.string().min(1).max(mentorAdviceLimits.diagnosisChars),
  }),
  leaks: z.array(MentorFindingSchema).max(mentorAdviceLimits.maxLeaks),
  eliminate: z
    .array(
      MentorFindingSchema.extend({
        text: z.string().min(1).max(mentorAdviceLimits.eliminateChars),
      }),
    )
    .max(mentorAdviceLimits.maxEliminate),
  rules: z
    .array(
      MentorStatementSchema.extend({
        text: z.string().min(1).max(mentorAdviceLimits.ruleChars),
      }),
    )
    .max(mentorAdviceLimits.maxRules),
  focus: MentorStatementSchema.extend({
    text: z.string().min(1).max(mentorAdviceLimits.focusChars),
  }),
});
export type MentorAdvice = z.infer<typeof MentorAdviceSchema>;

// ---------------------------------------------------------------------------
// Informes persistidos
// ---------------------------------------------------------------------------

export const MentorReportStatusEnum = z.enum(['PENDING', 'OK', 'NO_ADVICE', 'FAILED']);
export type MentorReportStatus = z.infer<typeof MentorReportStatusEnum>;

/** Fila del historial: sin digest ni advice, para que el listado pese poco. */
export const MentorReportSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  periodLabel: z.string(),
  periodFrom: z.string(),
  periodTo: z.string(),
  accountLabel: z.string(),
  status: MentorReportStatusEnum,
  model: z.string().nullable(),
  trades: z.number().int().nonnegative(),
  netBeforeDataFees: z.string(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  estimatedCostUsd: z.string().nullable(),
});
export type MentorReportSummary = z.infer<typeof MentorReportSummarySchema>;

export const MentorReportSchema = MentorReportSummarySchema.extend({
  digest: MentorDigestSchema,
  advice: MentorAdviceSchema.nullable(),
  /** true si se sirvió del cache por hash, sin llamar al proveedor. */
  cached: z.boolean(),
});
export type MentorReport = z.infer<typeof MentorReportSchema>;

export const MentorStatusSchema = z.object({
  /** Hay API key y modelo configurados: se puede generar consejo. */
  enabled: z.boolean(),
  model: z.string().nullable(),
  minTrades: z.number().int().nonnegative(),
  dailyLimit: z.number().int().nonnegative(),
  usedToday: z.number().int().nonnegative(),
  monthReports: z.number().int().nonnegative(),
  monthInputTokens: z.number().int().nonnegative(),
  monthOutputTokens: z.number().int().nonnegative(),
  monthEstimatedCostUsd: z.string(),
});
export type MentorStatus = z.infer<typeof MentorStatusSchema>;

// ---------------------------------------------------------------------------
// Entradas de la API
// ---------------------------------------------------------------------------

export const MentorPeriodQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  /** YYYY-MM. Gana sobre `year`; sin ninguno de los dos, el periodo es todo. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  year: z.coerce.number().int().min(1900).max(3000).optional(),
});
export type MentorPeriodQuery = z.infer<typeof MentorPeriodQuerySchema>;

export const GenerateMentorReportSchema = z.object({
  accountId: z.string().uuid().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  year: z.number().int().min(1900).max(3000).optional(),
  /** El usuario aceptó que las notas del periodo se envíen al proveedor. */
  consent: z.literal(true),
});
export type GenerateMentorReportDto = z.infer<typeof GenerateMentorReportSchema>;

/** Código que el frontend necesita para pintar un vacío informativo, no un error. */
export const mentorNotEnoughTradesCode = 'NOT_ENOUGH_TRADES';
