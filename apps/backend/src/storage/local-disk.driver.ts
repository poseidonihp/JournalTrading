import { Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, posix, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StorageDriver, type SaveOptions, type StoredFile } from './storage.driver';

const URL_PREFIX = '/uploads';

@Injectable()
export class LocalDiskDriver extends StorageDriver {
  private readonly root: string;

  constructor() {
    super();
    const fromEnv = process.env.STORAGE_ROOT;
    this.root = resolve(fromEnv ?? join(process.cwd(), '..', '..', 'storage', 'uploads'));
  }

  get rootPath(): string {
    return this.root;
  }

  async save(opts: SaveOptions): Promise<StoredFile> {
    const ext = extname(opts.filename).toLowerCase() || LocalDiskDriver.extFromMime(opts.mime);
    const safeName = `${randomUUID()}${ext}`;
    const relative = posix.join(opts.userId, opts.tradeId, safeName);
    const absolute = join(this.root, relative);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, opts.buffer);
    return {
      path: relative,
      url: this.urlFor(relative),
      mime: opts.mime,
      sizeBytes: opts.buffer.byteLength,
    };
  }

  async delete(relative: string): Promise<void> {
    if (!relative) {
      return;
    }
    const absolute = join(this.root, relative);
    try {
      await unlink(absolute);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw e;
      }
    }
  }

  urlFor(relative: string): string {
    return `${URL_PREFIX}/${relative.replaceAll('\\', '/')}`;
  }

  private static extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
    };
    return map[mime] ?? '';
  }
}
