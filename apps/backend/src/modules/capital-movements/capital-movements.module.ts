import { Module } from '@nestjs/common';
import { CapitalMovementsController } from './capital-movements.controller';
import { CapitalMovementsService } from './capital-movements.service';

@Module({
  controllers: [CapitalMovementsController],
  providers: [CapitalMovementsService],
  exports: [CapitalMovementsService],
})
export class CapitalMovementsModule {}
