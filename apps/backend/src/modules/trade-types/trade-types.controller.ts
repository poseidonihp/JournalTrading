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
  CreateTradeTypeSchema,
  UpdateTradeTypeSchema,
  type CreateTradeTypeDto,
  type TradeType,
  type UpdateTradeTypeDto,
} from '@journal/shared-types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { TradeTypesService } from './trade-types.service';

@Controller('trade-types')
export class TradeTypesController {
  constructor(private readonly tradeTypes: TradeTypesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<TradeType[]> {
    return this.tradeTypes.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTradeTypeSchema)) dto: CreateTradeTypeDto,
  ): Promise<TradeType> {
    return this.tradeTypes.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTradeTypeSchema)) dto: UpdateTradeTypeDto,
  ): Promise<TradeType> {
    return this.tradeTypes.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.tradeTypes.remove(user.id, id);
  }
}
