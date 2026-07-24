import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ImportBatch, ImportResult } from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { parseNtCsv, type ParseError, type ParsedTradeRow } from './nt-csv.parser';

const DEFAULT_TRADE_TYPE_CODE = 'CONTINUATION';
const DEFAULT_EXIT_REASON = 'MANUAL';
const DEFAULT_EMOTION = 'CONFIDENT';

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ImportBatch[]> {
    const rows = await this.prisma.importBatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      source: r.source,
      fileName: r.fileName,
      status: r.status,
      totalRows: r.totalRows,
      importedCount: r.importedCount,
      skippedCount: r.skippedCount,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async importNinjaTraderCsv(
    userId: string,
    accountId: string,
    fileName: string,
    text: string,
  ): Promise<ImportResult> {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new BadRequestException('Cuenta inválida');

    const { rows, errors: parseErrors, totalRows } = parseNtCsv(text);

    if (rows.length === 0 && parseErrors.length > 0) {
      const batch = await this.prisma.importBatch.create({
        data: {
          userId,
          accountId,
          source: 'NINJATRADER',
          fileName,
          status: 'FAILED',
          totalRows,
          importedCount: 0,
          skippedCount: totalRows,
          errorMessage: parseErrors[0]?.message ?? 'No se pudo parsear el CSV',
        },
      });
      return { batch: this.toDto(batch), errors: parseErrors };
    }

    const instruments = await this.prisma.instrument.findMany();
    const instrumentBySymbol = new Map(instruments.map((i) => [i.symbol.toUpperCase(), i]));

    const tradeTypeId = await this.resolveDefaultTradeTypeId(userId);
    if (!tradeTypeId) {
      throw new BadRequestException(
        'No hay tipos de trade configurados para este usuario. Crea al menos uno antes de importar.',
      );
    }

    const errors: ParseError[] = [...parseErrors];
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        const instrument = instrumentBySymbol.get(row.symbolBase);
        if (!instrument) {
          skipped += 1;
          errors.push({
            row: row.rowNumber,
            message: `Instrumento desconocido: ${row.symbolBase}`,
          });
          continue;
        }
        if (row.externalId) {
          const existing = await this.prisma.trade.findUnique({
            where: { source_externalId: { source: 'NINJATRADER', externalId: row.externalId } },
          });
          if (existing) {
            skipped += 1;
            continue;
          }
        }
        await this.createTradeFromRow(userId, accountId, instrument, tradeTypeId, row);
        imported += 1;
      } catch (e) {
        skipped += 1;
        errors.push({
          row: row.rowNumber,
          message: e instanceof Error ? e.message : 'Error desconocido',
        });
      }
    }

    const status = ImportsService.computeStatus(imported, skipped, totalRows);
    const batch = await this.prisma.importBatch.create({
      data: {
        userId,
        accountId,
        source: 'NINJATRADER',
        fileName,
        status,
        totalRows,
        importedCount: imported,
        skippedCount: skipped,
        errorMessage:
          errors.length > 0
            ? errors
                .slice(0, 3)
                .map((e) => `Fila ${e.row}: ${e.message}`)
                .join('; ')
            : null,
      },
    });
    return { batch: this.toDto(batch), errors };
  }

  private async resolveDefaultTradeTypeId(userId: string): Promise<string | null> {
    const byCode = await this.prisma.tradeType.findFirst({
      where: { userId, code: DEFAULT_TRADE_TYPE_CODE },
      select: { id: true },
    });
    if (byCode) return byCode.id;
    const any = await this.prisma.tradeType.findFirst({
      where: { userId },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    return any?.id ?? null;
  }

  private async createTradeFromRow(
    userId: string,
    accountId: string,
    instrument: {
      id: string;
      pointValue: Prisma.Decimal;
      defaultCommissionPerContract: Prisma.Decimal;
    },
    tradeTypeId: string,
    row: ParsedTradeRow,
  ): Promise<void> {
    const pointValue = new Prisma.Decimal(instrument.pointValue);
    const points = new Prisma.Decimal(row.pointsTotal);
    const commission = row.commission
      ? new Prisma.Decimal(row.commission)
      : new Prisma.Decimal(instrument.defaultCommissionPerContract).mul(row.contracts);
    const gross =
      row.grossOverride !== null && row.grossOverride !== undefined
        ? new Prisma.Decimal(row.grossOverride)
        : points.mul(pointValue).mul(row.contracts);
    const net = gross.minus(commission);

    const durationSeconds = Math.max(
      0,
      Math.floor((row.exitedAt.getTime() - row.enteredAt.getTime()) / 1000),
    );

    await this.prisma.trade.create({
      data: {
        userId,
        accountId,
        instrumentId: instrument.id,
        enteredAt: row.enteredAt,
        exitedAt: row.exitedAt,
        durationSeconds,
        contracts: row.contracts,
        direction: row.direction,
        tradeTypeId,
        entryReason: `Importado de NinjaTrader (${row.symbolRaw})`,
        exitReason: DEFAULT_EXIT_REASON,
        emotion: DEFAULT_EMOTION,
        pointsTotal: points.toString(),
        pointValueSnapshot: pointValue.toString(),
        gross: gross.toFixed(2),
        commission: commission.toFixed(2),
        net: net.toFixed(2),
        source: 'NINJATRADER',
        externalId: row.externalId,
      },
    });
  }

  private static computeStatus(
    imported: number,
    skipped: number,
    total: number,
  ): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
    if (imported === 0 && total > 0) return 'FAILED';
    if (skipped > 0) return 'PARTIAL';
    return 'SUCCESS';
  }

  private toDto(b: {
    id: string;
    accountId: string;
    source: string;
    fileName: string;
    status: string;
    totalRows: number;
    importedCount: number;
    skippedCount: number;
    errorMessage: string | null;
    createdAt: Date;
  }): ImportBatch {
    return {
      id: b.id,
      accountId: b.accountId,
      source: b.source,
      fileName: b.fileName,
      status: b.status as ImportBatch['status'],
      totalRows: b.totalRows,
      importedCount: b.importedCount,
      skippedCount: b.skippedCount,
      errorMessage: b.errorMessage,
      createdAt: b.createdAt.toISOString(),
    };
  }

  async findOrThrow(userId: string, id: string): Promise<ImportBatch> {
    const row = await this.prisma.importBatch.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Batch no encontrado');
    return this.toDto(row);
  }
}
