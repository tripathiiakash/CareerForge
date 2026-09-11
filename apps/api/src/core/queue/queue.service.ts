import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ConfigService } from '../config/config.service';
import { JobHandler, QUEUE_NAMES, QueueSendOptions } from './queue.types';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly boss: PgBoss;

  constructor(private readonly configService: ConfigService) {
    this.boss = new PgBoss({
      connectionString: this.configService.databaseUrl,
      schema: this.configService.pgBossSchema,
    });

    this.boss.on('error', (error) => {
      this.logger.error(`PgBoss error: ${error.message}`, error.stack);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('Starting PgBoss queue engine...');
      await this.boss.start();
      this.logger.log(
        `PgBoss queue engine started successfully (schema: ${this.configService.pgBossSchema})`
      );

      // Ensure all defined application queues are explicitly registered
      for (const queueName of Object.values(QUEUE_NAMES)) {
        await this.createQueue(queueName);
      }
      this.logger.log(
        'PgBoss application queues verified/created successfully'
      );
    } catch (error: unknown) {
      this.logger.error('Failed to start PgBoss queue engine', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.logger.log('Stopping PgBoss queue engine gracefully...');
      await this.boss.stop({ graceful: true, timeout: 5000 });
      this.logger.log('PgBoss queue engine stopped');
    } catch (error: unknown) {
      this.logger.error('Error stopping PgBoss queue engine', error);
    }
  }

  async createQueue(name: string): Promise<void> {
    await this.boss.createQueue(name);
  }

  async send<T extends object>(
    name: string,
    data: T,
    options?: QueueSendOptions
  ): Promise<string | null> {
    return this.boss.send(name, data, options);
  }

  async work<T extends object>(
    name: string,
    handler: JobHandler<T>
  ): Promise<void> {
    await this.createQueue(name);
    await this.boss.work<T>(name, async (jobs) => {
      const jobList = Array.isArray(jobs) ? jobs : [jobs];
      for (const job of jobList) {
        await handler({
          id: job.id,
          name: job.name,
          data: job.data,
        });
      }
    });
  }
}
