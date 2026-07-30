import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type CapitalMovement as PrismaCapitalMovement } from '@prisma/client';
import type {
  CapitalMovement,
  CreateCapitalMovementDto,
  UpdateCapitalMovementDto,
} from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

const ACCOUNT_NOT_FOUND_MSG = 'Cuenta no encontrada';
const MOVEMENT_NOT_FOUND_MSG = 'Movimiento no encontrado';

/**
 * Aportes y retiros de capital de una cuenta. El saldo de la cuenta los aplica
 * en `AccountsService.toDto`; aquí sólo se administra el historial.
 * @class
 */
@Injectable()
export class CapitalMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, accountId: string): Promise<CapitalMovement[]> {
    await this.assertAccount(userId, accountId);
    const rows = await this.prisma.capitalMovement.findMany({
      where: { userId, accountId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(row => CapitalMovementsService.toDto(row));
  }

  async create(
    userId: string,
    accountId: string,
    dto: CreateCapitalMovementDto,
  ): Promise<CapitalMovement> {
    await this.assertAccount(userId, accountId);
    const created = await this.prisma.capitalMovement.create({
      data: {
        userId,
        accountId,
        type: dto.type,
        amount: dto.amount,
        occurredAt: new Date(dto.occurredAt),
        note: dto.note ?? null,
      },
    });
    return CapitalMovementsService.toDto(created);
  }

  async update(
    userId: string,
    accountId: string,
    id: string,
    dto: UpdateCapitalMovementDto,
  ): Promise<CapitalMovement> {
    await this.assertMovement(userId, accountId, id);
    const updated = await this.prisma.capitalMovement.update({
      where: { id },
      data: {
        type: dto.type,
        amount: dto.amount,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        note: dto.note === undefined ? undefined : dto.note,
      },
    });
    return CapitalMovementsService.toDto(updated);
  }

  async remove(userId: string, accountId: string, id: string): Promise<void> {
    await this.assertMovement(userId, accountId, id);
    await this.prisma.capitalMovement.delete({ where: { id } });
  }

  /**
   * Verifica que la cuenta exista y sea del usuario. El scoping por usuario es
   * manual en este proyecto, así que ningún método puede saltárselo.
   * @param {string} userId - Id del usuario autenticado
   * @param {string} accountId - Id de la cuenta
   * @returns {Promise<void>}
   */
  private async assertAccount(userId: string, accountId: string): Promise<void> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException(ACCOUNT_NOT_FOUND_MSG);
    }
  }

  /**
   * Verifica que el movimiento exista y pertenezca al usuario y a la cuenta.
   * @param {string} userId - Id del usuario autenticado
   * @param {string} accountId - Id de la cuenta
   * @param {string} id - Id del movimiento
   * @returns {Promise<void>}
   */
  private async assertMovement(userId: string, accountId: string, id: string): Promise<void> {
    const existing = await this.prisma.capitalMovement.findFirst({
      where: { id, userId, accountId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(MOVEMENT_NOT_FOUND_MSG);
    }
  }

  /**
   * Convierte la fila de Prisma al DTO: los decimales viajan como string.
   * @param {PrismaCapitalMovement} row - Fila de la base de datos
   * @returns {CapitalMovement}
   */
  private static toDto(row: PrismaCapitalMovement): CapitalMovement {
    return {
      id: row.id,
      accountId: row.accountId,
      type: row.type,
      amount: new Prisma.Decimal(row.amount).toFixed(2),
      occurredAt: row.occurredAt.toISOString(),
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
