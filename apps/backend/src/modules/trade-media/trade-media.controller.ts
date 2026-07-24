import {
  BadRequestException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import type { TradeMedia } from '@journal/shared-types';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TradeMediaService, type IncomingFile } from './trade-media.service';

interface FastifyMultipartRequest extends FastifyRequest {
  isMultipart(): boolean;
  files(): AsyncIterableIterator<MultipartFile>;
}

@Controller('trades/:tradeId/media')
export class TradeMediaController {
  constructor(private readonly media: TradeMediaService) {}

  @Post()
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', new ParseUUIDPipe()) tradeId: string,
    @Req() req: FastifyRequest,
  ): Promise<TradeMedia[]> {
    const multi = req as FastifyMultipartRequest;
    if (typeof multi.isMultipart !== 'function' || !multi.isMultipart()) {
      throw new BadRequestException('Se esperaba multipart/form-data');
    }

    const incoming: IncomingFile[] = [];
    for await (const part of multi.files()) {
      incoming.push({
        filename: part.filename ?? 'upload',
        mime: part.mimetype ?? 'application/octet-stream',
        buffer: await part.toBuffer(),
      });
    }

    return this.media.upload(user.id, tradeId, incoming);
  }

  @Delete(':mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tradeId', new ParseUUIDPipe()) tradeId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
  ): Promise<void> {
    return this.media.remove(user.id, tradeId, mediaId);
  }
}
