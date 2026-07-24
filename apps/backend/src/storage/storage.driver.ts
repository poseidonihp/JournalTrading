/**
 * Driver abstracto de almacenamiento de archivos.
 * En Fase 3 sólo existe LocalDiskDriver. En Fase 6 se añadirá S3Driver
 * y el módulo decidirá cuál inyectar según `STORAGE_DRIVER` en env.
 */
export interface StoredFile {
  /** Ruta relativa al root del driver (e.g. `userId/tradeId/abc.jpg`). */
  path: string;
  /** URL pública servible por el backend (montada en `/uploads/...`). */
  url: string;
  mime: string;
  sizeBytes: number;
}

export interface SaveOptions {
  userId: string;
  tradeId: string;
  filename: string;
  mime: string;
  buffer: Buffer;
}

export abstract class StorageDriver {
  abstract save(opts: SaveOptions): Promise<StoredFile>;
  abstract delete(path: string): Promise<void>;
  /** Devuelve la URL pública a partir de la ruta relativa. */
  abstract urlFor(path: string): string;
}
