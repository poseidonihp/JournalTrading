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
  UsePipes,
} from '@nestjs/common';
import {
  CreateInstrumentSchema,
  UpdateInstrumentSchema,
  type Instrument,
  type CreateInstrumentDto,
  type UpdateInstrumentDto,
} from '@journal/shared-types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InstrumentsService } from './instruments.service';

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Get()
  list(): Promise<Instrument[]> {
    return this.instruments.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateInstrumentSchema))
  create(@Body() dto: CreateInstrumentDto): Promise<Instrument> {
    return this.instruments.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateInstrumentSchema)) dto: UpdateInstrumentDto,
  ): Promise<Instrument> {
    return this.instruments.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.instruments.remove(id);
  }
}
