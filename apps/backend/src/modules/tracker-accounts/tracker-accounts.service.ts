import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateTrackerAccountDto,
  ResetTrackerAccountDto,
  TrackerAccount,
  UpdateTrackerAccountDto,
  UpdateTrackerAccountStatusDto,
  WithdrawTrackerAccountDto,
} from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

type TrackerAccountRow = {
  id: string;
  name: string;
  type: 'EVALUATION' | 'LIVE';
  status: 'ACTIVE' | 'SUSPENDED';
  company: string;
  totalExpenses: Prisma.Decimal;
  totalProfits: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TrackerAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<TrackerAccount[]> {
    const rows = await this.prisma.trackerAccount.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(userId: string, dto: CreateTrackerAccountDto): Promise<TrackerAccount> {
    try {
      const created = await this.prisma.trackerAccount.create({
        data: {
          userId,
          name: dto.name,
          type: dto.type,
          status: dto.status ?? 'ACTIVE',
          company: dto.company,
          totalExpenses: dto.totalExpenses ?? 0,
          totalProfits: dto.totalProfits ?? 0,
        },
      });
      return this.toDto(created);
    } catch (e) {
      this.translateUniqueError(e);
      throw e;
    }
  }

  async update(userId: string, id: string, dto: UpdateTrackerAccountDto): Promise<TrackerAccount> {
    await this.ensureOwned(userId, id);
    try {
      const updated = await this.prisma.trackerAccount.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.type === undefined ? {} : { type: dto.type }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(dto.company === undefined ? {} : { company: dto.company }),
          ...(dto.totalExpenses === undefined ? {} : { totalExpenses: dto.totalExpenses }),
          ...(dto.totalProfits === undefined ? {} : { totalProfits: dto.totalProfits }),
        },
      });
      return this.toDto(updated);
    } catch (e) {
      this.translateUniqueError(e);
      throw e;
    }
  }

  async updateStatus(
    userId: string,
    id: string,
    dto: UpdateTrackerAccountStatusDto,
  ): Promise<TrackerAccount> {
    await this.ensureOwned(userId, id);
    const updated = await this.prisma.trackerAccount.update({
      where: { id },
      data: { status: dto.status },
    });
    return this.toDto(updated);
  }

  async reset(userId: string, id: string, dto: ResetTrackerAccountDto): Promise<TrackerAccount> {
    await this.ensureOwned(userId, id);
    const updated = await this.prisma.trackerAccount.update({
      where: { id },
      data: {
        totalExpenses: { increment: dto.price },
      },
    });
    return this.toDto(updated);
  }

  async withdraw(
    userId: string,
    id: string,
    dto: WithdrawTrackerAccountDto,
  ): Promise<TrackerAccount> {
    const existing = await this.prisma.trackerAccount.findFirst({
      where: { id, userId },
      select: { id: true, type: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Cuenta no encontrada');
    }
    if (existing.type !== 'LIVE' || existing.status !== 'ACTIVE') {
      throw new ConflictException('Solo cuentas LIVE activas admiten retiros');
    }
    const updated = await this.prisma.trackerAccount.update({
      where: { id },
      data: {
        totalProfits: { increment: dto.amount },
      },
    });
    return this.toDto(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.ensureOwned(userId, id);
    await this.prisma.trackerAccount.delete({ where: { id } });
  }

  private async ensureOwned(userId: string, id: string): Promise<void> {
    const found = await this.prisma.trackerAccount.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Cuenta no encontrada');
    }
  }

  private translateUniqueError(e: unknown): void {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Ya existe una cuenta con ese nombre');
    }
  }

  private toDto(r: TrackerAccountRow): TrackerAccount {
    const totalExpenses = Number(r.totalExpenses);
    const totalProfits = Number(r.totalProfits);
    return {
      totalExpenses,
      totalProfits,
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      company: r.company,
      netProfit: totalProfits - totalExpenses,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
