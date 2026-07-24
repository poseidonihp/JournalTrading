import { Module } from '@nestjs/common';
import { TradeMediaController } from './trade-media.controller';
import { TradeMediaService } from './trade-media.service';

@Module({
  controllers: [TradeMediaController],
  providers: [TradeMediaService],
  exports: [TradeMediaService],
})
export class TradeMediaModule {}
