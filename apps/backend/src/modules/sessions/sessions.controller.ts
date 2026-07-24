import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UsePipes,
} from '@nestjs/common';
import {
  SessionListQuerySchema,
  UpsertSessionSchema,
  type Session,
  type SessionListQuery,
  type UpsertSessionDto,
} from '@journal/shared-types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { SessionsService } from './sessions.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(SessionListQuerySchema)) query: SessionListQuery,
  ): Promise<Session[]> {
    return this.sessions.list(user.id, query);
  }

  @Get('by-date/:date')
  async byDate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date') date: string,
  ): Promise<Session> {
    if (!DATE_RE.test(date)) {
      throw new NotFoundException('Fecha inválida');
    }
    const found = await this.sessions.findByDate(user.id, date);
    if (!found) throw new NotFoundException('Sesión no encontrada');
    return found;
  }

  @Put()
  @UsePipes(new ZodValidationPipe(UpsertSessionSchema))
  upsert(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertSessionDto): Promise<Session> {
    return this.sessions.upsert(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.sessions.remove(user.id, id);
  }
}
