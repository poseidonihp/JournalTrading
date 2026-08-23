import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../prisma/client';
import {
  mentorNotEnoughTradesCode,
  type GenerateMentorReportDto,
  type MentorAdvice,
  type MentorDigest,
  type MentorPeriodQuery,
  type MentorReport,
  type MentorReportSummary,
  type MentorStatus,
} from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.validation';
import { DigestBuilder, allAccountsKey } from './digest.builder';
import { normalizeAdvice } from './mentor.advice';
import {
  adviceJsonSchema,
  buildSystemPrompt,
  buildUserPrompt,
  promptVersion,
} from './mentor.prompt';
import {
  digestHash,
  identityWhere,
  isUniqueViolation,
  startOfDayUtc,
  startOfMonthUtc,
  summarySelect,
  toReport,
  toSummary,
} from './mentor.mapper';
import { OpenAiClient } from './openai.client';

const historyLimit = 30;
const tokensPerMillion = 1_000_000;
const costDecimals = 6;
/** Espera máxima a que otro request termine el mismo informe. */
const raceWaitAttempts = 20;
const raceWaitMs = 500;

/**
 * Orquesta Mentor Mode: digest determinista, cache por hash, límite de gasto y
 * persistencia del historial. Todo se filtra siempre por `userId`.
 * @class
 */
@Injectable()
export class MentorService {
  private readonly logger = new Logger(MentorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly builder: DigestBuilder,
    private readonly openai: OpenAiClient,
  ) {}

  /**
   * Estado del feature y consumo del mes en curso.
   * @param {string} userId - Usuario autenticado
   * @returns {Promise<MentorStatus>}
   */
  async status(userId: string): Promise<MentorStatus> {
    const monthStart = startOfMonthUtc();
    const [usedToday, month] = await Promise.all([
      this.prisma.mentorReport.count({
        where: { userId, createdAt: { gte: startOfDayUtc() }, status: { in: ['OK', 'PENDING'] } },
      }),
      this.prisma.mentorReport.aggregate({
        where: { userId, createdAt: { gte: monthStart } },
        _count: { id: true },
        _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
      }),
    ]);

    return {
      enabled: this.openai.isEnabled(),
      model: this.openai.model(),
      minTrades: this.config.get('MENTOR_MIN_TRADES', { infer: true }),
      dailyLimit: this.config.get('MENTOR_DAILY_LIMIT', { infer: true }),
      monthReports: month._count.id,
      monthInputTokens: month._sum.inputTokens ?? 0,
      monthOutputTokens: month._sum.outputTokens ?? 0,
      monthEstimatedCostUsd: (month._sum.estimatedCostUsd ?? new Prisma.Decimal(0)).toFixed(
        costDecimals,
      ),
      usedToday,
    };
  }

  /**
   * Digest determinista del periodo. No depende de OpenAI.
   * @param {string} userId - Usuario autenticado
   * @param {MentorPeriodQuery} query - Cuenta y periodo
   * @returns {Promise<MentorDigest>}
   */
  digest(userId: string, query: MentorPeriodQuery): Promise<MentorDigest> {
    return this.builder.build(userId, query, this.maxDigestChars());
  }

  /**
   * Historial de informes del usuario, del más reciente al más antiguo.
   * @param {string} userId - Usuario autenticado
   * @returns {Promise<MentorReportSummary[]>}
   */
  async list(userId: string): Promise<MentorReportSummary[]> {
    const rows = await this.prisma.mentorReport.findMany({
      where: { userId, status: { not: 'PENDING' } },
      select: summarySelect,
      orderBy: { createdAt: 'desc' },
      take: historyLimit,
    });
    return rows.map(row => toSummary(row));
  }

  /**
   * Informe completo, con digest y consejo.
   * @param {string} userId - Usuario autenticado
   * @param {string} id - Informe pedido
   * @returns {Promise<MentorReport>}
   */
  async findOne(userId: string, id: string): Promise<MentorReport> {
    const row = await this.prisma.mentorReport.findFirst({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException('El informe no existe');
    }
    return toReport(row, true);
  }

  /**
   * Borra un informe del historial.
   * @param {string} userId - Usuario autenticado
   * @param {string} id - Informe a borrar
   * @returns {Promise<void>}
   */
  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.prisma.mentorReport.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) {
      throw new NotFoundException('El informe no existe');
    }
  }

  /**
   * Genera el informe del periodo. Si el hash del digest ya tiene informe, lo
   * devuelve sin llamar ni pagar.
   * @param {string} userId - Usuario autenticado
   * @param {GenerateMentorReportDto} dto - Periodo, cuenta y consentimiento
   * @returns {Promise<MentorReport>}
   */
  async generate(userId: string, dto: GenerateMentorReportDto): Promise<MentorReport> {
    const digest = await this.digest(userId, {
      accountId: dto.accountId,
      month: dto.month,
      year: dto.year,
    });
    this.assertGeneratable(digest);

    const hash = digestHash(digest);
    const cached = await this.prisma.mentorReport.findFirst({
      where: { userId, ...identityWhere(digest, hash), status: { not: 'FAILED' } },
    });
    if (cached) {
      return cached.status === 'PENDING'
        ? this.waitForConcurrentReport(userId, digest, hash)
        : toReport(cached, true);
    }

    const reservation = await this.reserve(userId, digest, hash);
    if (!reservation) {
      return this.waitForConcurrentReport(userId, digest, hash);
    }

    if (!this.openai.isEnabled()) {
      const row = await this.prisma.mentorReport.update({
        where: { id: reservation },
        data: { status: 'NO_ADVICE' },
      });
      return toReport(row, false);
    }

    try {
      const advice = await this.askModel(digest);
      const row = await this.prisma.mentorReport.update({
        where: { id: reservation },
        data: {
          status: 'OK',
          advice: advice.advice as unknown as Prisma.InputJsonValue,
          model: this.openai.model(),
          inputTokens: advice.inputTokens,
          outputTokens: advice.outputTokens,
          estimatedCostUsd: this.estimateCost(advice.inputTokens, advice.outputTokens),
        },
      });
      return toReport(row, false);
    } catch (error) {
      // La reserva se libera para que el usuario pueda reintentar el mismo hash.
      await this.prisma.mentorReport.delete({ where: { id: reservation } }).catch(() => undefined);
      this.logger.error(
        'MentorService > generate - falló la generación del informe',
        error instanceof Error ? error.message : undefined,
      );
      throw error;
    }
  }

  /**
   * Comprueba las precondiciones antes de gastar una llamada.
   * @private
   * @param {MentorDigest} digest - Digest recién calculado
   * @returns {void}
   */
  private assertGeneratable(digest: MentorDigest): void {
    if (digest.mixedCurrencies) {
      throw new UnprocessableEntityException({
        code: 'MIXED_CURRENCIES',
        message: 'El alcance mezcla monedas distintas: elige una cuenta para generar el análisis',
      });
    }
    const minTrades = this.config.get('MENTOR_MIN_TRADES', { infer: true });
    if (digest.overall.trades < minTrades) {
      throw new UnprocessableEntityException({
        code: mentorNotEnoughTradesCode,
        message: `Se necesitan al menos ${minTrades} trades en el periodo para generar un análisis`,
        minTrades
      });
    }
  }

  /**
   * Reserva cupo y clave de idempotencia creando la fila PENDING. Devuelve null
   * si otro request se adelantó con el mismo hash.
   * @private
   * @param {string} userId - Usuario autenticado
   * @param {MentorDigest} digest - Digest del periodo
   * @param {string} hash - Hash canónico del digest
   * @returns {Promise<string | null>}
   */
  private async reserve(
    userId: string,
    digest: MentorDigest,
    hash: string,
  ): Promise<string | null> {
    const dailyLimit = this.config.get('MENTOR_DAILY_LIMIT', { infer: true });
    try {
      return await this.prisma.$transaction(
        async tx => {
          const used = await tx.mentorReport.count({
            where: {
              userId,
              createdAt: { gte: startOfDayUtc() },
              status: { in: ['OK', 'PENDING'] },
            },
          });
          if (used >= dailyLimit) {
            throw new UnprocessableEntityException({
              code: 'DAILY_LIMIT_REACHED',
              message: `Llegaste al límite de ${dailyLimit} análisis por día`,
            });
          }
          const created = await tx.mentorReport.create({
            data: {
              userId,
              promptVersion,
              accountId: digest.accountSetKey === allAccountsKey ? null : digest.accountSetKey,
              accountSetKey: digest.accountSetKey,
              accountLabel: digest.accountLabel,
              periodLabel: digest.period.label,
              periodFrom: new Date(digest.period.from),
              periodTo: new Date(digest.period.to),
              digestVersion: digest.digestVersion,
              digestHash: hash,
              digest: digest as unknown as Prisma.InputJsonValue,
              status: 'PENDING',
              trades: digest.overall.trades,
              netBeforeDataFees: new Prisma.Decimal(digest.overall.netBeforeDataFees),
            },
            select: { id: true },
          });
          return created.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Espera a que el request que ganó la carrera termine el mismo informe.
   * @private
   * @param {string} userId - Usuario autenticado
   * @param {MentorDigest} digest - Digest del periodo
   * @param {string} hash - Hash canónico del digest
   * @returns {Promise<MentorReport>}
   */
  private async waitForConcurrentReport(
    userId: string,
    digest: MentorDigest,
    hash: string,
  ): Promise<MentorReport> {
    for (let attempt = 0; attempt < raceWaitAttempts; attempt += 1) {
      await sleep(raceWaitMs);
      const row = await this.prisma.mentorReport.findFirst({
        where: { userId, ...identityWhere(digest, hash) },
      });
      if (row && row.status !== 'PENDING') {
        return toReport(row, true);
      }
      if (!row) {
        break;
      }
    }
    throw new ConflictException('Ya hay un análisis en curso para este periodo, intenta de nuevo');
  }

  /**
   * Llama al proveedor y normaliza la respuesta.
   * @private
   * @param {MentorDigest} digest - Digest del periodo
   * @returns {Promise<{ advice: MentorAdvice; inputTokens: number; outputTokens: number }>}
   */
  private async askModel(
    digest: MentorDigest,
  ): Promise<{ advice: MentorAdvice; inputTokens: number; outputTokens: number }> {
    const result = await this.openai.complete(
      buildSystemPrompt(),
      buildUserPrompt(digest),
      adviceJsonSchema(),
    );
    return {
      advice: normalizeAdvice(result.content, digest),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

  /** Coste estimado con las tarifas del `.env`; con tarifas en 0 no reporta gasto. */
  private estimateCost(inputTokens: number, outputTokens: number): Prisma.Decimal {
    const inputPrice = this.config.get('MENTOR_PRICE_INPUT_PER_MTOK', { infer: true });
    const outputPrice = this.config.get('MENTOR_PRICE_OUTPUT_PER_MTOK', { infer: true });
    return new Prisma.Decimal(inputTokens)
      .times(inputPrice)
      .plus(new Prisma.Decimal(outputTokens).times(outputPrice))
      .div(tokensPerMillion);
  }

  private maxDigestChars(): number {
    return this.config.get('MENTOR_MAX_DIGEST_CHARS', { infer: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
