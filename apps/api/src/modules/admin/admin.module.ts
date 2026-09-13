import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminUserController],
  providers: [AdminUserService],
  exports: [AdminUserService],
})
export class AdminModule {}
