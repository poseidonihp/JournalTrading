import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CapitalMovementType,
  DataFeeFrequency,
  Prisma,
  type Account as PrismaAccount,
} from '@prisma/client';
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
    return Promise.all(rows.map(value => this.toDto(value)));
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
          initialBalanceAt: AccountsService.resolveInitialBalanceAt(dto.initialBalanceAt) ?? null,
          isActive: dto.isActive,
          ...feeConfig,
        },
      });
      return this.findById(userId, row.id);
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
      await this.prisma.account.update({
        where: { id },
        data: {
          name: dto.name,
          broker: dto.broker ?? undefined,
          currency: dto.currency,
          initialBalance: dto.initialBalance,
          initialBalanceAt: AccountsService.resolveInitialBalanceAt(dto.initialBalanceAt),
          isActive: dto.isActive,
          ...feeUpdate,
        },
      });
      await this.repriceCharges(existing, dto);
      return this.findById(userId, id);
    } catch (e) {
      throw AccountsService.handleKnownErrors(e);
    }
  }

  /**
   * Reajusta el monto de los cargos ya emitidos desde el periodo elegido en
   * «aplicar desde» hacia adelante.
   * @param {PrismaAccount} existing - Cuenta tal como estaba antes del update
   * @param {UpdateAccountDto} dto - Cambios solicitados
   * @returns {Promise<void>}
   */
  private async repriceCharges(existing: PrismaAccount, dto: UpdateAccountDto): Promise<void> {
    const enabled = dto.dataFeeEnabled ?? existing.dataFeeEnabled;
    if (!enabled || !dto.dataFeeNextChargeAt || dto.dataFeeAmount === undefined) {
      return;
    }
    const amount = new Prisma.Decimal(dto.dataFeeAmount);
    await this.prisma.dataFeeCharge.updateMany({
      where: {
        accountId: existing.id,
        periodStart: { gte: new Date(dto.dataFeeNextChargeAt) },
      },
      data: { amount },
    });
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
    const frequency = acc.dataFeeFrequency;
    if (!frequency || !acc.dataFeeNextChargeAt) {
      return;
    }
    const now = new Date();
    const periods: Date[] = [];
    let nextAt = acc.dataFeeNextChargeAt;

    while (nextAt.getTime() <= now.getTime()) {
      periods.push(nextAt);
      nextAt = AccountsService.nextPeriodStart(nextAt, frequency);
    }

    const lastPeriod = periods.at(-1);
    if (!lastPeriod) {
      return;
    }
    const pending = await this.uncharged(acc.id, periods);
    const scheduleAt = nextAt;
    await this.prisma.$transaction(async tx => {
      if (pending.length > 0) {
        await tx.dataFeeCharge.createMany({
          data: pending.map(periodStart => ({
            accountId: acc.id,
            amount: acc.dataFeeAmount,
            chargedAt: now,
            frequency,
            periodStart,
          })),
        });
      }
      await tx.account.update({
        where: { id: acc.id },
        data: { dataFeeNextChargeAt: scheduleAt, dataFeeLastChargedAt: lastPeriod },
      });
    });
  }

  /**
   * Filtra los periodos que todavía no tienen un cargo registrado en la cuenta.
   * @param {string} accountId - Id de la cuenta
   * @param {Date[]} periods - Inicios de periodo candidatos a cobro
   * @returns {Promise<Date[]>}
   */
  private async uncharged(accountId: string, periods: Date[]): Promise<Date[]> {
    const existing = await this.prisma.dataFeeCharge.findMany({
      where: { accountId, periodStart: { in: periods } },
      select: { periodStart: true },
    });
    const charged = new Set(existing.map(row => row.periodStart.getTime()));
    return periods.filter(periodStart => !charged.has(periodStart.getTime()));
  }

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
      : AccountsService.nextPeriodStart(new Date(), dto.dataFeeFrequency);
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
    const nextChargeAt = AccountsService.resolveNextCharge(existing, frequency, dto);
    if (nextChargeAt) {
      update.dataFeeNextChargeAt = nextChargeAt;
    }
    return update;
  }

  /**
   * Resuelve la fecha del próximo cobro en un update. Devuelve null cuando la
   * fecha vigente sigue siendo válida y no debe tocarse. Se recalcula si no
   * había fecha, si el cliente envía null para reiniciar el calendario o si
   * cambió la frecuencia (la fecha anterior ya no está alineada al periodo).
   * @param {PrismaAccount} existing - Cuenta tal como está en base de datos
   * @param {DataFeeFrequency} frequency - Frecuencia resultante tras el update
   * @param {UpdateAccountDto} dto - Cambios solicitados
   * @returns {Date | null}
   */
  private static resolveNextCharge(
    existing: PrismaAccount,
    frequency: DataFeeFrequency,
    dto: UpdateAccountDto,
  ): Date | null {
    if (dto.dataFeeNextChargeAt) {
      return new Date(dto.dataFeeNextChargeAt);
    }
    const reset = dto.dataFeeNextChargeAt === null || !existing.dataFeeNextChargeAt;
    const frequencyChanged = existing.dataFeeFrequency !== frequency;
    if (reset || frequencyChanged) {
      return AccountsService.nextPeriodStart(new Date(), frequency);
    }
    return null;
  }

  /**
   * Devuelve el inicio del periodo siguiente al que contiene `from`, alineado
   * al calendario y siempre en el día 1 a las 00:00 UTC: mensual → 1 del mes
   * siguiente; trimestral → 1 de ene/abr/jul/oct; anual → 1 de enero.
   * @param {Date} from - Fecha de referencia
   * @param {DataFeeFrequency} frequency - Frecuencia del fee
   * @returns {Date}
   */
  private static nextPeriodStart(from: Date, frequency: DataFeeFrequency): Date {
    const months = AccountsService.monthsFor(frequency);
    const currentPeriodMonth = Math.floor(from.getUTCMonth() / months) * months;
    return new Date(Date.UTC(from.getUTCFullYear(), currentPeriodMonth + months, 1, 0, 0, 0, 0));
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

  private static handleKnownErrors(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('Ya tienes una cuenta con ese nombre');
    }
    return e instanceof Error ? e : new Error('Error desconocido');
  }

  /**
   * Inicio del periodo desde el cual todos los cargos ya emitidos llevan el
   * monto vigente de la cuenta.
   * @param {ReadonlyArray<{ periodStart: Date; amount: Prisma.Decimal }>} charges - Cargos en orden ascendente
   * @param {Prisma.Decimal} amount - Monto vigente de la cuenta
   * @returns {Date | null}
   */
  private static amountAppliedSince(
    charges: ReadonlyArray<{ periodStart: Date; amount: Prisma.Decimal }>,
    amount: Prisma.Decimal,
  ): Date | null {
    let since: Date | null = null;
    for (let index = charges.length - 1; index >= 0; index--) {
      const charge = charges[index];
      if (!charge?.amount.eq(amount)) {
        break;
      }
      since = charge.periodStart;
    }
    return since;
  }

  /**
   * Traduce el `initialBalanceAt` del DTO a lo que espera Prisma: `undefined`
   * cuando el cliente no lo envía (no se toca), `null` cuando lo envía vacío
   * (se borra la fecha) y un `Date` cuando trae valor.
   * @param {string | null | undefined} value - Fecha ISO recibida
   * @returns {Date | null | undefined}
   */
  private static resolveInitialBalanceAt(
    value: string | null | undefined,
  ): Date | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    return value ? new Date(value) : null;
  }

  /**
   * Suma los movimientos de capital de un tipo a partir del groupBy de Prisma.
   * @param {ReadonlyArray<{ type: CapitalMovementType; _sum: { amount: Prisma.Decimal | null } }>} groups - Grupos por tipo
   * @param {CapitalMovementType} type - Tipo buscado
   * @returns {Prisma.Decimal}
   */
  private static movementTotal(
    groups: ReadonlyArray<{ type: CapitalMovementType; _sum: { amount: Prisma.Decimal | null } }>,
    type: CapitalMovementType,
  ): Prisma.Decimal {
    const group = groups.find(row => row.type === type);
    return group?._sum.amount ?? ZERO;
  }

  private async toDto(a: PrismaAccount): Promise<Account> {
    const [tradeAgg, charges, movements] = await Promise.all([
      this.prisma.trade.aggregate({ where: { accountId: a.id }, _sum: { net: true } }),
      this.prisma.dataFeeCharge.findMany({
        where: { accountId: a.id },
        orderBy: { periodStart: 'asc' },
        select: { periodStart: true, amount: true },
      }),
      this.prisma.capitalMovement.groupBy({
        by: ['type'],
        where: { accountId: a.id },
        _sum: { amount: true },
      }),
    ]);
    const tradeNet = tradeAgg._sum.net ?? ZERO;
    const fees = charges.reduce((acc, charge) => acc.plus(charge.amount), ZERO);
    const firstCharged = charges[0]?.periodStart ?? null;
    const amountSince = AccountsService.amountAppliedSince(charges, a.dataFeeAmount);
    const deposits = AccountsService.movementTotal(movements, 'DEPOSIT');
    const withdrawals = AccountsService.movementTotal(movements, 'WITHDRAWAL');
    const contributed = new Prisma.Decimal(a.initialBalance).plus(deposits).minus(withdrawals);
    const current = contributed.plus(tradeNet).minus(fees);
    return {
      id: a.id,
      name: a.name,
      broker: a.broker,
      currency: a.currency,
      initialBalance: a.initialBalance.toString(),
      initialBalanceAt: a.initialBalanceAt ? a.initialBalanceAt.toISOString() : null,
      depositsTotal: deposits.toFixed(2),
      withdrawalsTotal: withdrawals.toFixed(2),
      contributedCapital: contributed.toFixed(2),
      currentBalance: current.toFixed(2),
      isActive: a.isActive,
      dataFeeEnabled: a.dataFeeEnabled,
      dataFeeAmount: a.dataFeeAmount.toString(),
      dataFeeFrequency: a.dataFeeFrequency,
      dataFeeNextChargeAt: a.dataFeeNextChargeAt ? a.dataFeeNextChargeAt.toISOString() : null,
      dataFeeLastChargedAt: a.dataFeeLastChargedAt ? a.dataFeeLastChargedAt.toISOString() : null,
      dataFeeFirstChargedAt: firstCharged ? firstCharged.toISOString() : null,
      dataFeeAmountSince: amountSince ? amountSince.toISOString() : null,
    };
  }
}
