import { z } from 'zod';

const MAX_NAME = 120;
const MAX_COMPANY = 120;

export const TrackerAccountTypeEnum = z.enum(['EVALUATION', 'LIVE']);
export type TrackerAccountType = z.infer<typeof TrackerAccountTypeEnum>;

export const TrackerAccountStatusEnum = z.enum(['ACTIVE', 'SUSPENDED']);
export type TrackerAccountStatus = z.infer<typeof TrackerAccountStatusEnum>;

export const TrackerAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: TrackerAccountTypeEnum,
  status: TrackerAccountStatusEnum,
  company: z.string(),
  totalExpenses: z.number(),
  totalProfits: z.number(),
  netProfit: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TrackerAccount = z.infer<typeof TrackerAccountSchema>;

export const CreateTrackerAccountSchema = z.object({
  name: z.string().min(1).max(MAX_NAME),
  type: TrackerAccountTypeEnum,
  status: TrackerAccountStatusEnum.optional(),
  company: z.string().min(1).max(MAX_COMPANY),
  totalExpenses: z.number().nonnegative().optional(),
  totalProfits: z.number().nonnegative().optional(),
});
export type CreateTrackerAccountDto = z.infer<typeof CreateTrackerAccountSchema>;

export const UpdateTrackerAccountSchema = CreateTrackerAccountSchema.partial();
export type UpdateTrackerAccountDto = z.infer<typeof UpdateTrackerAccountSchema>;

export const UpdateTrackerAccountStatusSchema = z.object({
  status: TrackerAccountStatusEnum,
});
export type UpdateTrackerAccountStatusDto = z.infer<typeof UpdateTrackerAccountStatusSchema>;

export const ResetTrackerAccountSchema = z.object({
  price: z.number().positive(),
  date: z.string(),
});
export type ResetTrackerAccountDto = z.infer<typeof ResetTrackerAccountSchema>;

export const WithdrawTrackerAccountSchema = z.object({
  amount: z.number().positive(),
  date: z.string(),
});
export type WithdrawTrackerAccountDto = z.infer<typeof WithdrawTrackerAccountSchema>;
