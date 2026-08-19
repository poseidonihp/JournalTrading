import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  type Trade as PrismaTrade,
  type TradeMedia as PrismaTradeMedia,
} from '../../prisma/client';
import type {
  CreateTradeDto,
  Trade,
  TradeFilters,
  TradeListResponse,
  TradeMedia,
  UpdateTradeDto,
} from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { LocalDiskDriver } from '../../storage/local-disk.driver';

const DEFAULT_COMMISSION = '0';

type PrismaTradeWithRelations = PrismaTrade & {
  instrument: { symbol: string };
  tradeType: { id: string; name: string; color: string };
  media: PrismaTradeMedia[];
};

const TRADE_INCLUDE = {
  instrument: { select: { symbol: true } },
  tradeType: { select: { id: true, name: true, color: true } },
  media: { orderBy: { position: 'asc' } },
} as const;

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalDiskDriver,
  ) {}

  // ------------------------------------------------------------------
  // Read
  // ------------------------------------------------------------------

  async list(userId: string, filters: TradeFilters): Promise<TradeListResponse> {
    const where = this.buildWhere(userId, filters);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.trade.findMany({
        where,
        include: TRADE_INCLUDE,
        orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.trade.count({ where }),
    ]);
    return {
      items: items.map((t) => this.toDto(t)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async findById(userId: string, id: string): Promise<Trade> {
    const trade = await this.prisma.trade.findFirst({
      where: { id, userId },
      include: TRADE_INCLUDE,
    });
    if (!trade) throw new NotFoundException('Trade no encontrado');
    return this.toDto(trade);
  }

  /** Para export CSV (sin paginación). */
  async listAllForExport(userId: string, filters: TradeFilters): Promise<Trade[]> {
    const rows = await this.prisma.trade.findMany({
      where: this.buildWhere(userId, filters),
      include: TRADE_INCLUDE,
      orderBy: [{ enteredAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((t) => this.toDto(t));
  }

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------

  async create(userId: string, dto: CreateTradeDto): Promise<Trade> {
    const { instrument, account, tradeType } = await this.loadRefs(
      userId,
      dto.accountId,
      dto.instrumentId,
      dto.tradeTypeId,
    );

    const pointValue = new Prisma.Decimal(instrument.pointValue);
    const points = new Prisma.Decimal(dto.pointsTotal);
    const commission = new Prisma.Decimal(
      dto.commission ?? this.defaultCommissionFor(instrument, dto.contracts),
    );
    const gross = dto.grossOverride
      ? new Prisma.Decimal(dto.grossOverride)
      : points.mul(pointValue).mul(dto.contracts);
    const net = dto.netOverride ? new Prisma.Decimal(dto.netOverride) : gross.minus(commission);

    const durationSeconds = TradesService.diffSeconds(dto.enteredAt, dto.exitedAt);

    const created = await this.prisma.trade.create({
      data: {
        userId,
        accountId: account.id,
        instrumentId: instrument.id,
        enteredAt: new Date(dto.enteredAt),
        exitedAt: new Date(dto.exitedAt),
        durationSeconds,
        contracts: dto.contracts,
        direction: dto.direction,
        tradeTypeId: tradeType.id,
        entryReason: dto.entryReason ?? null,
        exitReason: dto.exitReason,
        emotion: dto.emotion,
        pointsTotal: points.toString(),
        pointValueSnapshot: pointValue.toString(),
        gross: gross.toFixed(2),
        commission: commission.toFixed(2),
        net: net.toFixed(2),
        notes: dto.notes ?? null,
        source: 'MANUAL',
      },
      include: TRADE_INCLUDE,
    });
    return this.toDto(created);
  }

  async update(userId: string, id: string, dto: UpdateTradeDto): Promise<Trade> {
    const current = await this.prisma.trade.findFirst({
      where: { id, userId },
      include: { instrument: true },
    });
    if (!current) throw new NotFoundException('Trade no encontrado');

    const nextAccountId = dto.accountId ?? current.accountId;
    const nextInstrumentId = dto.instrumentId ?? current.instrumentId;
    const nextTradeTypeId = dto.tradeTypeId ?? current.tradeTypeId;

    let instrument = current.instrument;
    const needsRefLoad =
      nextInstrumentId !== current.instrumentId ||
      nextAccountId !== current.accountId ||
      nextTradeTypeId !== current.tradeTypeId;
    if (needsRefLoad) {
      const refs = await this.loadRefs(userId, nextAccountId, nextInstrumentId, nextTradeTypeId);
      if (nextInstrumentId !== current.instrumentId) {
        instrument = refs.instrument;
      }
    }

    const nextContracts = dto.contracts ?? current.contracts;
    const nextPoints = new Prisma.Decimal(dto.pointsTotal ?? current.pointsTotal);
    const pointValue = new Prisma.Decimal(instrument.pointValue);
    const nextCommission = new Prisma.Decimal(dto.commission ?? current.commission.toString());
    const gross = dto.grossOverride
      ? new Prisma.Decimal(dto.grossOverride)
      : nextPoints.mul(pointValue).mul(nextContracts);
    const net = dto.netOverride ? new Prisma.Decimal(dto.netOverride) : gross.minus(nextCommission);

    const enteredAt = dto.enteredAt ? new Date(dto.enteredAt) : current.enteredAt;
    const exitedAt = dto.exitedAt ? new Date(dto.exitedAt) : current.exitedAt;
    if (exitedAt.getTime() < enteredAt.getTime()) {
      throw new BadRequestException('exitedAt debe ser posterior a enteredAt');
    }

    const updated = await this.prisma.trade.update({
      where: { id },
      data: {
        accountId: nextAccountId,
        instrumentId: nextInstrumentId,
        enteredAt,
        exitedAt,
        durationSeconds: Math.floor((exitedAt.getTime() - enteredAt.getTime()) / 1000),
        contracts: nextContracts,
        direction: dto.direction ?? current.direction,
        tradeTypeId: nextTradeTypeId,
        entryReason: dto.entryReason === undefined ? current.entryReason : dto.entryReason,
        exitReason: dto.exitReason ?? current.exitReason,
        emotion: dto.emotion ?? current.emotion,
        pointsTotal: nextPoints.toString(),
        pointValueSnapshot: pointValue.toString(),
        gross: gross.toFixed(2),
        commission: nextCommission.toFixed(2),
        net: net.toFixed(2),
        notes: dto.notes === undefined ? current.notes : dto.notes,
      },
      include: TRADE_INCLUDE,
    });
    return this.toDto(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const trade = await this.prisma.trade.findFirst({
      where: { id, userId },
      include: { media: true },
    });
    if (!trade) throw new NotFoundException('Trade no encontrado');
    for (const m of trade.media) {
      await this.storage.delete(m.path);
      if (m.thumbnailPath) await this.storage.delete(m.thumbnailPath);
    }
    await this.prisma.trade.delete({ where: { id } });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private buildWhere(userId: string, filters: TradeFilters): Prisma.TradeWhereInput {
    const where: Prisma.TradeWhereInput = { userId };
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.instrumentId) where.instrumentId = filters.instrumentId;
    if (filters.tradeTypeId) where.tradeTypeId = filters.tradeTypeId;
    if (filters.emotion) where.emotion = filters.emotion;
    if (filters.direction) where.direction = filters.direction;
    if (filters.exitReason) where.exitReason = filters.exitReason;

    if (filters.month) {
      const [y, m] = filters.month.split('-').map((s) => Number(s));
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      where.enteredAt = { gte: start, lt: end };
    } else if (filters.from || filters.to) {
      where.enteredAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    return where;
  }

  private async loadRefs(
    userId: string,
    accountId: string,
    instrumentId: string,
    tradeTypeId: string,
  ) {
    const [account, instrument, tradeType] = await Promise.all([
      this.prisma.account.findFirst({ where: { id: accountId, userId } }),
      this.prisma.instrument.findUnique({ where: { id: instrumentId } }),
      this.prisma.tradeType.findFirst({ where: { id: tradeTypeId, userId } }),
    ]);
    if (!account) throw new BadRequestException('Cuenta inválida');
    if (!instrument) throw new BadRequestException('Instrumento inválido');
    if (!tradeType) throw new BadRequestException('Tipo de trade inválido');
    return { account, instrument, tradeType };
  }

  private defaultCommissionFor(
    instrument: { defaultCommissionPerContract: Prisma.Decimal },
    contracts: number,
  ): string {
    return new Prisma.Decimal(instrument.defaultCommissionPerContract).mul(contracts).toFixed(4);
  }

  private static diffSeconds(from: string, to: string): number {
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.max(0, Math.floor((b - a) / 1000));
  }

  private toDto(t: PrismaTradeWithRelations): Trade {
    return {
      id: t.id,
      accountId: t.accountId,
      instrumentId: t.instrumentId,
      instrumentSymbol: t.instrument.symbol,
      enteredAt: t.enteredAt.toISOString(),
      exitedAt: t.exitedAt.toISOString(),
      durationSeconds: t.durationSeconds,
      contracts: t.contracts,
      direction: t.direction,
      tradeTypeId: t.tradeType.id,
      tradeTypeName: t.tradeType.name,
      tradeTypeColor: t.tradeType.color,
      entryReason: t.entryReason,
      exitReason: t.exitReason,
      emotion: t.emotion,
      pointsTotal: t.pointsTotal.toString(),
      pointValueSnapshot: t.pointValueSnapshot.toString(),
      gross: t.gross.toString(),
      commission: t.commission.toString(),
      net: t.net.toString(),
      notes: t.notes,
      source: t.source,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      media: t.media.map((m) => this.mediaToDto(m)),
    };
  }

  private mediaToDto(m: PrismaTradeMedia): TradeMedia {
    return {
      id: m.id,
      tradeId: m.tradeId,
      kind: m.kind,
      url: this.storage.urlFor(m.path),
      thumbnailUrl: m.thumbnailPath ? this.storage.urlFor(m.thumbnailPath) : null,
      mime: m.mime,
      sizeBytes: m.sizeBytes,
      position: m.position,
    };
  }

  // Silencia el warning de variable no usada — exposed por si se llega a
  // necesitar como fallback explícito desde el controller en el futuro.
  static readonly DEFAULT_COMMISSION = DEFAULT_COMMISSION;
}
