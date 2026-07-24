import { z } from 'zod';

export const ImportStatusEnum = z.enum(['PENDING', 'SUCCESS', 'PARTIAL', 'FAILED']);
export type ImportStatus = z.infer<typeof ImportStatusEnum>;

export const ImportBatchSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  source: z.string(),
  fileName: z.string(),
  status: ImportStatusEnum,
  totalRows: z.number().int().nonnegative(),
  importedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
});
export type ImportBatch = z.infer<typeof ImportBatchSchema>;

export const ImportResultSchema = z.object({
  batch: ImportBatchSchema,
  errors: z.array(
    z.object({
      row: z.number().int().nonnegative(),
      message: z.string(),
    }),
  ),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;
