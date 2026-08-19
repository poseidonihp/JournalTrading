import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Instrument as PrismaInstrument } from '../../prisma/client';
import type { Instrument, CreateInstrumentDto, UpdateInstrumentDto } from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Instrument[]> {
    const rows = await this.prisma.instrument.findMany({ orderBy: { symbol: 'asc' } });
    return rows.map(InstrumentsService.toDto);
  }

  async create(dto: CreateInstrumentDto): Promise<Instrument> {
    try {
      const row = await this.prisma.instrument.create({
        data: {
          symbol: dto.symbol,
          name: dto.name,
          category: dto.category,
          pointValue: dto.pointValue,
          defaultCommissionPerContract: dto.defaultCommissionPerContract,
          tickSize: dto.tickSize,
          currency: dto.currency,
        },
      });
      return InstrumentsService.toDto(row);
    } catch (e) {
      throw InstrumentsService.handleKnownErrors(e);
    }
  }

  async update(id: string, dto: UpdateInstrumentDto): Promise<Instrument> {
    await this.findById(id);
    try {
      const row = await this.prisma.instrument.update({
        where: { id },
        data: {
          symbol: dto.symbol,
          name: dto.name,
          category: dto.category,
          pointValue: dto.pointValue,
          defaultCommissionPerContract: dto.defaultCommissionPerContract,
          tickSize: dto.tickSize,
          currency: dto.currency,
        },
      });
      return InstrumentsService.toDto(row);
    } catch (e) {
      throw InstrumentsService.handleKnownErrors(e);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    const trades = await this.prisma.trade.count({ where: { instrumentId: id } });
    if (trades > 0) {
      throw new ConflictException('No se puede eliminar un instrumento con trades asociados.');
    }
    await this.prisma.instrument.delete({ where: { id } });
  }

  private async findById(id: string): Promise<PrismaInstrument> {
    const row = await this.prisma.instrument.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Instrumento no encontrado');
    }
    return row;
  }

  private static handleKnownErrors(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('Ya existe un instrumento con ese símbolo');
    }
    return e instanceof Error ? e : new Error('Error desconocido');
  }

  static toDto(i: PrismaInstrument): Instrument {
    return {
      id: i.id,
      symbol: i.symbol,
      name: i.name,
      category: i.category,
      pointValue: i.pointValue.toString(),
      defaultCommissionPerContract: i.defaultCommissionPerContract.toString(),
      tickSize: i.tickSize.toString(),
      currency: i.currency,
    };
  }
}
