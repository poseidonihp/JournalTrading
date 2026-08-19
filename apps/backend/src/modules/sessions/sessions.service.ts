import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Session as PrismaSession } from '../../prisma/client';
import type { Session, SessionListQuery, UpsertSessionDto } from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: SessionListQuery): Promise<Session[]> {
    const where: Prisma.SessionWhereInput = { userId };
    if (query.month) {
      const [yStr, mStr] = query.month.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      where.date = {
        gte: new Date(Date.UTC(y, m - 1, 1)),
        lt: new Date(Date.UTC(y, m, 1)),
      };
    } else if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    const rows = await this.prisma.session.findMany({
      where,
      orderBy: { date: 'desc' },
    });
    return rows.map((r) => SessionsService.toDto(r));
  }

  async findByDate(userId: string, date: string): Promise<Session | null> {
    const row = await this.prisma.session.findUnique({
      where: { userId_date: { userId, date: new Date(`${date}T00:00:00.000Z`) } },
    });
    return row ? SessionsService.toDto(row) : null;
  }

  async upsert(userId: string, dto: UpsertSessionDto): Promise<Session> {
    const dateObj = new Date(`${dto.date}T00:00:00.000Z`);
    const row = await this.prisma.session.upsert({
      where: { userId_date: { userId, date: dateObj } },
      create: {
        userId,
        date: dateObj,
        notes: dto.notes,
        mood: dto.mood ?? null,
      },
      update: {
        notes: dto.notes,
        mood: dto.mood ?? null,
      },
    });
    return SessionsService.toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.session.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Sesión no encontrada');
    await this.prisma.session.delete({ where: { id } });
  }

  private static toDto(r: PrismaSession): Session {
    return {
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      notes: r.notes,
      mood: r.mood,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
