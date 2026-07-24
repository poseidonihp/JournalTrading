import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  CreateTradeSchema,
  TradeFiltersSchema,
  UpdateTradeSchema,
  type CreateTradeDto,
  type Trade,
  type TradeFilters,
  type TradeListResponse,
  type UpdateTradeDto,
} from '@journal/shared-types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TradesService } from './trades.service';
import { tradesToCsv } from './trades.csv';

@Controller('trades')
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(TradeFiltersSchema)) filters: TradeFilters,
  ): Promise<TradeListResponse> {
    return this.trades.list(user.id, filters);
  }

  @Get('export.csv')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(TradeFiltersSchema)) filters: TradeFilters,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const trades = await this.trades.listAllForExport(user.id, filters);
    const csv = tradesToCsv(trades);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="trades-${Date.now()}.csv"`);
    // BOM para que Excel reconozca UTF-8.
    void reply.send(`﻿${csv}`);
  }

  @Get(':id')
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Trade> {
    return this.trades.findById(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTradeSchema)) dto: CreateTradeDto,
  ): Promise<Trade> {
    return this.trades.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTradeSchema)) dto: UpdateTradeDto,
  ): Promise<Trade> {
    return this.trades.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.trades.remove(user.id, id);
  }
}
