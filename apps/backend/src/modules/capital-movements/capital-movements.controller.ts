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
  CreateCapitalMovementSchema,
  UpdateCapitalMovementSchema,
  type CapitalMovement,
  type CreateCapitalMovementDto,
  type UpdateCapitalMovementDto,
} from '@journal/shared-types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { CapitalMovementsService } from './capital-movements.service';

@Controller('accounts/:accountId/movements')
export class CapitalMovementsController {
  constructor(private readonly movements: CapitalMovementsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<CapitalMovement[]> {
    return this.movements.list(user.id, accountId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body(new ZodValidationPipe(CreateCapitalMovementSchema)) dto: CreateCapitalMovementDto,
  ): Promise<CapitalMovement> {
    return this.movements.create(user.id, accountId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateCapitalMovementSchema)) dto: UpdateCapitalMovementDto,
  ): Promise<CapitalMovement> {
    return this.movements.update(user.id, accountId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.movements.remove(user.id, accountId, id);
  }
}
