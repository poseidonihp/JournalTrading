import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataFeeFrequency, Prisma, type Account as PrismaAccount } from '@prisma/client';
import type { Account, CreateAccountDto, UpdateAccountDto } from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

const ZERO = new Prisma.Decimal(0);
const FEE_REQUIRED_MSG = 'Frecuencia del fee es obligatoria cuando se habilita.';
const ACCOUNT_NOT_FOUND_MSG = 'Cuenta no encontrada';
const MONTHS_PER_QUARTER = 3;
const MONTHS_PER_YEAR = 12;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Account[]> {
    await this.settlePendingFees(userId);
    const rows = await this.prisma.account.findMany({
      where: { userId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async findById(userId: string, id: string): Promise<Account> {
    await this.settleAccountIfPending(userId, id);
    const row = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException(ACCOUNT_NOT_FOUND_MSG);
    }
    return this.toDto(row);
  }

  async create(userId: string, dto: CreateAccountDto): Promise<Account> {
    try {
      const feeConfig = AccountsService.buildFeeCreate(dto);
      const row = await this.prisma.account.create({
        data: {
          userId,
          name: dto.name,
          broker: dto.broker ?? null,
          currency: dto.currency,
          initialBalance: dto.initialBalance,
          isActive: dto.isActive,
          ...feeConfig,
        },
      });
      return this.toDto(row);
    } catch (e) {
      throw AccountsService.handleKnownErrors(e);
    }
  }

  async update(userId: string, id: string, dto: UpdateAccountDto): Promise<Account> {
    const existing = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new NotFoundException(ACCOUNT_NOT_FOUND_MSG);
    }
    try {
      const feeUpdate = AccountsService.buildFeeUpdate(existing, dto);
      const row = await this.prisma.account.update({
        where: { id },
        data: {
          name: dto.name,
          broker: dto.broker ?? undefined,
          currency: dto.currency,
          initialBalance: dto.initialBalance,
          isActive: dto.isActive,
          ...feeUpdate,
        },
      });
      return this.toDto(row);
    } catch (e) {
      throw AccountsService.handleKnownErrors(e);
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new NotFoundException(ACCOUNT_NOT_FOUND_MSG);
    }
    const trades = await this.prisma.trade.count({ where: { accountId: id } });
    if (trades > 0) {
      throw new ConflictException(
        'No se puede eliminar una cuenta con trades asociados. Desactívala en su lugar.',
      );
    }
    await this.prisma.account.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Liquidación perezosa de fees por data en tiempo real.
  // Se ejecuta al listar/leer cuentas: si nextChargeAt ya pasó, registra
  // tantos cargos como periodos vencidos y avanza la fecha.
  // -------------------------------------------------------------------------

  private async settlePendingFees(userId: string): Promise<void> {
    const due = await this.prisma.account.findMany({
      where: {
        userId,
        dataFeeEnabled: true,
        dataFeeFrequency: { not: null },
        dataFeeNextChargeAt: { lte: new Date() },
      },
    });
    for (const acc of due) {
      await this.applyDueCharges(acc);
    }
  }

  private async settleAccountIfPending(userId: string, id: string): Promise<void> {
    const acc = await this.prisma.account.findFirst({
      where: {
        id,
        userId,
        dataFeeEnabled: true,
        dataFeeFrequency: { not: null },
        dataFeeNextChargeAt: { lte: new Date() },
      },
    });
    if (acc) {
      await this.applyDueCharges(acc);
    }
  }

  private async applyDueCharges(acc: PrismaAccount): Promise<void> {
    if (!acc.dataFeeFrequency || !acc.dataFeeNextChargeAt) {
      return;
    }
    const now = new Date();
    let nextAt = acc.dataFeeNextChargeAt;
    let lastAt = acc.dataFeeLastChargedAt;
    const charges: Prisma.DataFeeChargeCreateManyInput[] = [];

    while (nextAt.getTime() <= now.getTime()) {
      charges.push({
        accountId: acc.id,
        amount: acc.dataFeeAmount,
        frequency: acc.dataFeeFrequency,
        periodStart: nextAt,
        chargedAt: now,
      });
      lastAt = nextAt;
      nextAt = AccountsService.advance(nextAt, acc.dataFeeFrequency);
    }

    if (charges.length === 0) {
      return;
    }
    await this.prisma.$transaction([
      this.prisma.dataFeeCharge.createMany({ data: charges }),
      this.prisma.account.update({
        where: { id: acc.id },
        data: { dataFeeNextChargeAt: nextAt, dataFeeLastChargedAt: lastAt },
      }),
    ]);
  }

  // -------------------------------------------------------------------------
  // Helpers de configuración del fee.
  // -------------------------------------------------------------------------

  private static buildFeeCreate(
    dto: CreateAccountDto,
  ): Partial<Prisma.AccountUncheckedCreateInput> {
    if (!dto.dataFeeEnabled) {
      return {
        dataFeeEnabled: false,
        dataFeeAmount: '0',
        dataFeeFrequency: null,
        dataFeeNextChargeAt: null,
      };
    }
    if (!dto.dataFeeFrequency) {
      throw new ConflictException(FEE_REQUIRED_MSG);
    }
    const nextAt = dto.dataFeeNextChargeAt
      ? new Date(dto.dataFeeNextChargeAt)
      : AccountsService.firstOfNextMonth(new Date());
    return {
      dataFeeEnabled: true,
      dataFeeAmount: dto.dataFeeAmount ?? '0',
      dataFeeFrequency: dto.dataFeeFrequency,
      dataFeeNextChargeAt: nextAt,
    };
  }

  private static buildFeeUpdate(
    existing: PrismaAccount,
    dto: UpdateAccountDto,
  ): Partial<Prisma.AccountUpdateInput> {
    const enabled = dto.dataFeeEnabled ?? existing.dataFeeEnabled;
    if (!enabled) {
      return {
        dataFeeEnabled: false,
        dataFeeFrequency: null,
        dataFeeNextChargeAt: null,
      };
    }
    const frequency = dto.dataFeeFrequency ?? existing.dataFeeFrequency;
    if (!frequency) {
      throw new ConflictException(FEE_REQUIRED_MSG);
    }
    const update: Partial<Prisma.AccountUpdateInput> = {
      dataFeeEnabled: true,
      dataFeeFrequency: frequency,
    };
    if (dto.dataFeeAmount !== undefined) {
      update.dataFeeAmount = dto.dataFeeAmount;
    }
    if (dto.dataFeeNextChargeAt !== undefined) {
      update.dataFeeNextChargeAt = dto.dataFeeNextChargeAt
        ? new Date(dto.dataFeeNextChargeAt)
        : AccountsService.firstOfNextMonth(new Date());
    } else if (!existing.dataFeeNextChargeAt) {
      update.dataFeeNextChargeAt = AccountsService.firstOfNextMonth(new Date());
    }
    return update;
  }

  private static advance(from: Date, frequency: DataFeeFrequency): Date {
    const months = AccountsService.monthsFor(frequency);
    const next = new Date(from);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
  }

  private static monthsFor(frequency: DataFeeFrequency): number {
    if (frequency === 'MONTHLY') {
      return 1;
    }
    if (frequency === 'QUARTERLY') {
      return MONTHS_PER_QUARTER;
    }
    return MONTHS_PER_YEAR;
  }

  private static firstOfNextMonth(from: Date): Date {
    return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  }

  private static handleKnownErrors(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('Ya tienes una cuenta con ese nombre');
    }
    return e instanceof Error ? e : new Error('Error desconocido');
  }

  private async toDto(a: PrismaAccount): Promise<Account> {
    const [tradeAgg, feeAgg] = await Promise.all([
      this.prisma.trade.aggregate({ where: { accountId: a.id }, _sum: { net: true } }),
      this.prisma.dataFeeCharge.aggregate({
        where: { accountId: a.id },
        _sum: { amount: true },
      }),
    ]);
    const tradeNet = tradeAgg._sum.net ?? ZERO;
    const fees = feeAgg._sum.amount ?? ZERO;
    const current = new Prisma.Decimal(a.initialBalance).plus(tradeNet).minus(fees);
    return {
      id: a.id,
      name: a.name,
      broker: a.broker,
      currency: a.currency,
      initialBalance: a.initialBalance.toString(),
      currentBalance: current.toFixed(2),
      isActive: a.isActive,
      dataFeeEnabled: a.dataFeeEnabled,
      dataFeeAmount: a.dataFeeAmount.toString(),
      dataFeeFrequency: a.dataFeeFrequency,
      dataFeeNextChargeAt: a.dataFeeNextChargeAt ? a.dataFeeNextChargeAt.toISOString() : null,
      dataFeeLastChargedAt: a.dataFeeLastChargedAt ? a.dataFeeLastChargedAt.toISOString() : null,
    };
  }
}
