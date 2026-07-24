import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import type { TradeMedia } from '@journal/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { LocalDiskDriver } from '../../storage/local-disk.driver';

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
const THUMBNAIL_WIDTH = 480;

export interface IncomingFile {
  filename: string;
  mime: string;
  buffer: Buffer;
}

@Injectable()
export class TradeMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalDiskDriver,
  ) {}

  async upload(userId: string, tradeId: string, files: IncomingFile[]): Promise<TradeMedia[]> {
    if (files.length === 0) throw new BadRequestException('Sin archivos para subir');

    const trade = await this.prisma.trade.findFirst({ where: { id: tradeId, userId } });
    if (!trade) throw new NotFoundException('Trade no encontrado');

    const startPos = await this.prisma.tradeMedia.count({ where: { tradeId } });

    const out: TradeMedia[] = [];
    for (const [idx, file] of files.entries()) {
      out.push(await this.persistOne(userId, tradeId, file, startPos + idx));
    }
    return out;
  }

  async remove(userId: string, tradeId: string, mediaId: string): Promise<void> {
    const media = await this.prisma.tradeMedia.findFirst({
      where: { id: mediaId, tradeId, trade: { userId } },
    });
    if (!media) throw new NotFoundException('Media no encontrado');

    await this.storage.delete(media.path);
    if (media.thumbnailPath) await this.storage.delete(media.thumbnailPath);
    await this.prisma.tradeMedia.delete({ where: { id: mediaId } });
  }

  private async persistOne(
    userId: string,
    tradeId: string,
    file: IncomingFile,
    position: number,
  ): Promise<TradeMedia> {
    const kind = TradeMediaService.classifyKind(file.mime);
    TradeMediaService.assertSize(file, kind);

    const stored = await this.storage.save({
      userId,
      tradeId,
      filename: file.filename,
      mime: file.mime,
      buffer: file.buffer,
    });

    let thumbnailPath: string | null = null;
    if (kind === 'IMAGE') {
      const thumb = await sharp(file.buffer)
        .rotate()
        .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      const thumbStored = await this.storage.save({
        userId,
        tradeId,
        filename: `thumb-${file.filename.replace(/\.[^.]+$/, '')}.jpg`,
        mime: 'image/jpeg',
        buffer: thumb,
      });
      thumbnailPath = thumbStored.path;
    }

    const created = await this.prisma.tradeMedia.create({
      data: {
        tradeId,
        kind,
        path: stored.path,
        thumbnailPath,
        mime: file.mime,
        sizeBytes: stored.sizeBytes,
        position,
      },
    });

    return {
      id: created.id,
      tradeId: created.tradeId,
      kind: created.kind,
      url: this.storage.urlFor(created.path),
      thumbnailUrl: created.thumbnailPath ? this.storage.urlFor(created.thumbnailPath) : null,
      mime: created.mime,
      sizeBytes: created.sizeBytes,
      position: created.position,
    };
  }

  private static classifyKind(mime: string): 'IMAGE' | 'VIDEO' {
    if (ALLOWED_IMAGE_MIMES.has(mime)) return 'IMAGE';
    if (ALLOWED_VIDEO_MIMES.has(mime)) return 'VIDEO';
    throw new UnsupportedMediaTypeException(`Tipo de archivo no permitido: ${mime}`);
  }

  private static assertSize(file: IncomingFile, kind: 'IMAGE' | 'VIDEO'): void {
    const limit = kind === 'IMAGE' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.buffer.byteLength > limit) {
      throw new PayloadTooLargeException(
        `Archivo demasiado grande (${file.buffer.byteLength} bytes, máximo ${limit})`,
      );
    }
  }
}
