import { Module } from '@nestjs/common';
import { TrackerAccountsController } from './tracker-accounts.controller';
import { TrackerAccountsService } from './tracker-accounts.service';

@Module({
  controllers: [TrackerAccountsController],
  providers: [TrackerAccountsService],
  exports: [TrackerAccountsService],
})
export class TrackerAccountsModule {}
