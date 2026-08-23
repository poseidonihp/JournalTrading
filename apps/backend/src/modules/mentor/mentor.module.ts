import { Module } from '@nestjs/common';
import { MentorController } from './mentor.controller';
import { MentorService } from './mentor.service';
import { DigestBuilder } from './digest.builder';
import { OpenAiClient } from './openai.client';

@Module({
  controllers: [MentorController],
  providers: [MentorService, DigestBuilder, OpenAiClient],
})
export class MentorModule {}
