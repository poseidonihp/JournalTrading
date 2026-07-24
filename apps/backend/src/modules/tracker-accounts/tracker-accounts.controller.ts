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
} from '@nestjs/common';
import {
  CreateTrackerAccountSchema,
  ResetTrackerAccountSchema,
  UpdateTrackerAccountSchema,
  UpdateTrackerAccountStatusSchema,
  WithdrawTrackerAccountSchema,
  type CreateTrackerAccountDto,
  type ResetTrackerAccountDto,
  type TrackerAccount,
  type UpdateTrackerAccountDto,
  type UpdateTrackerAccountStatusDto,
  type WithdrawTrackerAccountDto,
} from '@journal/shared-types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { TrackerAccountsService } from './tracker-accounts.service';

@Controller('tracker-accounts')
export class TrackerAccountsController {
  constructor(private readonly service: TrackerAccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<TrackerAccount[]> {
    return this.service.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTrackerAccountSchema)) dto: CreateTrackerAccountDto,
  ): Promise<TrackerAccount> {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTrackerAccountSchema)) dto: UpdateTrackerAccountDto,
  ): Promise<TrackerAccount> {
    return this.service.update(user.id, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTrackerAccountStatusSchema))
    dto: UpdateTrackerAccountStatusDto,
  ): Promise<TrackerAccount> {
    return this.service.updateStatus(user.id, id, dto);
  }

  @Post(':id/reset')
  reset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ResetTrackerAccountSchema)) dto: ResetTrackerAccountDto,
  ): Promise<TrackerAccount> {
    return this.service.reset(user.id, id, dto);
  }

  @Post(':id/withdraw')
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(WithdrawTrackerAccountSchema)) dto: WithdrawTrackerAccountDto,
  ): Promise<TrackerAccount> {
    return this.service.withdraw(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.service.remove(user.id, id);
  }
}
