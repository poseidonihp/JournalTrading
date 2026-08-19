import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import type { CreateTradeTypeDto, TradeType, UpdateTradeTypeDto } from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TradeTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<TradeType[]> {
    const rows = await this.prisma.tradeType.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { trades: true } } },
    });
    return rows.map((r) => this.toDto(r, r._count.trades));
  }

  async create(userId: string, dto: CreateTradeTypeDto): Promise<TradeType> {
    try {
      const created = await this.prisma.tradeType.create({
        data: { userId, name: dto.name, color: dto.color },
      });
      return this.toDto(created, 0);
    } catch (e) {
      this.translateUniqueError(e);
      throw e;
    }
  }

  async update(userId: string, id: string, dto: UpdateTradeTypeDto): Promise<TradeType> {
    const existing = await this.prisma.tradeType.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Tipo de trade no encontrado');
    try {
      const updated = await this.prisma.tradeType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
        },
        include: { _count: { select: { trades: true } } },
      });
      return this.toDto(updated, updated._count.trades);
    } catch (e) {
      this.translateUniqueError(e);
      throw e;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.tradeType.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Tipo de trade no encontrado');
    try {
      await this.prisma.tradeType.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === 'P2003' || e.code === 'P2014')
      ) {
        throw new ConflictException('No se puede eliminar: hay trades usando este tipo');
      }
      throw e;
    }
  }

  private translateUniqueError(e: unknown): void {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Ya existe un tipo de trade con ese nombre');
    }
  }

  private toDto(
    r: { id: string; name: string; color: string; code: string | null; createdAt: Date },
    tradesCount: number,
  ): TradeType {
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      code: r.code,
      tradesCount,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
