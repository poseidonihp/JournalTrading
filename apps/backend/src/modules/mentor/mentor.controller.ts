import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  GenerateMentorReportSchema,
  MentorPeriodQuerySchema,
  type GenerateMentorReportDto,
  type MentorDigest,
  type MentorPeriodQuery,
  type MentorReport,
  type MentorReportSummary,
  type MentorStatus,
} from '@journal/shared-types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { MentorService } from './mentor.service';

const generateLimitPerHour = 10;
const generateThrottleTtlSec = 3600;

@Controller('mentor')
export class MentorController {
  constructor(private readonly mentor: MentorService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser): Promise<MentorStatus> {
    return this.mentor.status(user.id);
  }

  @Get('digest')
  digest(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(MentorPeriodQuerySchema)) query: MentorPeriodQuery,
  ): Promise<MentorDigest> {
    return this.mentor.digest(user.id, query);
  }

  @Get('reports')
  list(@CurrentUser() user: AuthenticatedUser): Promise<MentorReportSummary[]> {
    return this.mentor.list(user.id);
  }

  @Get('reports/:id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MentorReport> {
    return this.mentor.findOne(user.id, id);
  }

  @Post('reports')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: seconds(generateThrottleTtlSec), limit: generateLimitPerHour } })
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(GenerateMentorReportSchema)) dto: GenerateMentorReportDto,
  ): Promise<MentorReport> {
    return this.mentor.generate(user.id, dto);
  }

  @Delete('reports/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.mentor.remove(user.id, id);
  }
}
