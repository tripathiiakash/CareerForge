import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { listUsersQuerySchema, updateUserBanSchema } from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AdminUserService } from './admin-user.service';
import {
  DeleteUserResponseDto,
  ListUsersResponseDto,
} from './dto/admin-user-response.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import {
  UpdateUserBanDto,
  UpdateUserBanResponseDto,
} from './dto/update-user-ban.dto';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  /**
   * 9.3 List Platform Users
   * GET /api/v1/admin/users
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listUsers(
    @Query(new ZodValidationPipe(listUsersQuerySchema))
    query: ListUsersQueryDto
  ): Promise<ListUsersResponseDto> {
    const { data, meta } = await this.adminUserService.listUsers(query);
    return {
      success: true,
      data,
      meta,
    };
  }

  /**
   * 9.4 Delete / Ban User
   * DELETE /api/v1/admin/users/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        exceptionFactory: () =>
          new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Invalid id format (must be a valid UUID)',
          }),
      })
    )
    id: string,
    @CurrentUser() adminUser: AuthenticatedUser
  ): Promise<DeleteUserResponseDto> {
    const { message } = await this.adminUserService.deleteUser(
      id,
      adminUser.userId
    );
    return {
      success: true,
      message,
    };
  }

  /**
   * 9.5 Soft Ban / Unban User
   * PATCH /api/v1/admin/users/:id/ban
   */
  @Patch(':id/ban')
  @HttpCode(HttpStatus.OK)
  async updateUserBan(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        exceptionFactory: () =>
          new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Invalid id format (must be a valid UUID)',
          }),
      })
    )
    id: string,
    @Body(new ZodValidationPipe(updateUserBanSchema))
    dto: UpdateUserBanDto,
    @CurrentUser() adminUser: AuthenticatedUser
  ): Promise<UpdateUserBanResponseDto> {
    const data = await this.adminUserService.updateUserBan(
      id,
      dto.is_banned,
      adminUser.userId
    );
    return {
      success: true,
      data,
    };
  }
}
