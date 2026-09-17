import { Module } from '@nestjs/common';
import { ProceedingsController } from './proceedings.controller';
import { ProceedingsService } from './proceedings.service';

@Module({
  controllers: [ProceedingsController],
  providers: [ProceedingsService],
  exports: [ProceedingsService],
})
export class ProceedingsModule {}
