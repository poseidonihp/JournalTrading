import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CapitalMovementsModule } from './modules/capital-movements/capital-movements.module';
import { InstrumentsModule } from './modules/instruments/instruments.module';
import { TradesModule } from './modules/trades/trades.module';
import { TradeMediaModule } from './modules/trade-media/trade-media.module';
import { InsightsModule } from './modules/insights/insights.module';
import { MentorModule } from './modules/mentor/mentor.module';
import { TradeTypesModule } from './modules/trade-types/trade-types.module';
import { TrackerAccountsModule } from './modules/tracker-accounts/tracker-accounts.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ImportsModule } from './modules/imports/imports.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: seconds(60),
        limit: 100,
      },
    ]),
    PrismaModule,
    StorageModule,
    AuthModule,
    HealthModule,
    AccountsModule,
    CapitalMovementsModule,
    InstrumentsModule,
    TradesModule,
    TradeMediaModule,
    InsightsModule,
    MentorModule,
    TradeTypesModule,
    TrackerAccountsModule,
    SessionsModule,
    ImportsModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
