import { Controller, Get, Query } from '@nestjs/common';
import {
  CalendarQuerySchema,
  InsightsFiltersSchema,
  YearlyQuerySchema,
  TimePerformanceQuerySchema,
  type CalendarMonth,
  type CalendarQuery,
  type DrawdownReport,
  type EquityCurve,
  type InsightsFilters,
  type KpiSummary,
  type YearlyQuery,
  type YearlyReport,
  type TimePerformanceQuery,
  type TimePerformanceReport,
} from '@journal/shared-types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.dto';
import { InsightsService } from './insights.service';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('kpis')
  kpis(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(InsightsFiltersSchema)) filters: InsightsFilters,
  ): Promise<KpiSummary> {
    return this.insights.kpis(user.id, filters);
  }

  @Get('equity')
  equity(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(InsightsFiltersSchema)) filters: InsightsFilters,
  ): Promise<EquityCurve> {
    return this.insights.equity(user.id, filters);
  }

  @Get('available-months')
  availableMonths(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountId') accountId?: string,
  ): Promise<string[]> {
    return this.insights.availableMonths(user.id, accountId || undefined);
  }

  @Get('drawdown')
  drawdown(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(InsightsFiltersSchema)) filters: InsightsFilters,
  ): Promise<DrawdownReport> {
    return this.insights.drawdown(user.id, filters);
  }

  @Get('yearly')
  yearly(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(YearlyQuerySchema)) query: YearlyQuery,
  ): Promise<YearlyReport> {
    return this.insights.yearly(user.id, query.year, query.accountId);
  }

  @Get('time-performance')
  timePerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(TimePerformanceQuerySchema)) query: TimePerformanceQuery,
  ): Promise<TimePerformanceReport> {
    return this.insights.timePerformance(user.id, query.year, query.accountId);
  }

  @Get('calendar')
  calendar(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(CalendarQuerySchema)) query: CalendarQuery,
  ): Promise<CalendarMonth> {
    return this.insights.calendar(user.id, query);
  }
}
