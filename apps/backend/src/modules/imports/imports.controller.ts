import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import type { ImportBatch, ImportResult } from '@journal/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { ImportsService } from './imports.service';

interface FastifyMultipartRequest extends FastifyRequest {
  isMultipart(): boolean;
  file(): Promise<MultipartFile | undefined>;
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ImportBatch[]> {
    return this.imports.list(user.id);
  }

  @Get(':id')
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ImportBatch> {
    return this.imports.findOrThrow(user.id, id);
  }

  @Post('ninjatrader')
  async uploadNinjaTrader(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountId') accountId: string,
    @Req() req: FastifyRequest,
  ): Promise<ImportResult> {
    if (!accountId || !UUID_RE.test(accountId)) {
      throw new BadRequestException('accountId requerido');
    }
    const multi = req as FastifyMultipartRequest;
    if (typeof multi.isMultipart !== 'function' || !multi.isMultipart()) {
      throw new BadRequestException('Se esperaba multipart/form-data');
    }
    const part = await multi.file();
    if (!part) throw new BadRequestException('Archivo CSV requerido');
    const buffer = await part.toBuffer();
    const text = buffer.toString('utf-8');
    return this.imports.importNinjaTraderCsv(
      user.id,
      accountId,
      part.filename ?? 'ninjatrader.csv',
      text,
    );
  }
}
