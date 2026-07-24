import { Module } from '@nestjs/common';
import { TradeTypesController } from './trade-types.controller';
import { TradeTypesService } from './trade-types.service';

@Module({
  controllers: [TradeTypesController],
  providers: [TradeTypesService],
  exports: [TradeTypesService],
})
export class TradeTypesModule {}
