import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { QueueService } from './queue.service';

@Module({
  imports: [ConfigModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
