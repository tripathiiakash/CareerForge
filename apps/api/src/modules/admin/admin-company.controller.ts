import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  assignRecruiterCompanySchema,
  createCompanySchema,
  listAllRecruitersQuerySchema,
  listCompaniesQuerySchema,
  updateCompanySchema,
} from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { AdminCompanyService } from './admin-company.service';
import {
  AdminCompanyResponseDto,
  AssignRecruiterCompanyDto,
  AssignRecruiterCompanyResponseDto,
  CreateAdminCompanyDto,
  ListAllRecruitersQueryDto,
  ListAllRecruitersResponseDto,
  ListCompaniesQueryDto,
  ListCompaniesResponseDto,
  UpdateAdminCompanyDto,
} from './dto/admin-company-response.dto';

const uuidPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid id format (must be a valid UUID)',
    }),
});

@Controller('admin/companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCompanyController {
  constructor(private readonly adminCompanyService: AdminCompanyService) {}

  /**
   * List Companies (paginated + searchable)
   * GET /api/v1/admin/companies
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listCompanies(
    @Query(new ZodValidationPipe(listCompaniesQuerySchema))
    query: ListCompaniesQueryDto
  ): Promise<ListCompaniesResponseDto> {
    const { data, meta } = await this.adminCompanyService.listCompanies(query);
    return { success: true, data, meta };
  }

  /**
   * List All Recruiters (for the company-assignment panel)
   * GET /api/v1/admin/companies/recruiters
   */
  @Get('recruiters')
  @HttpCode(HttpStatus.OK)
  async listAllRecruiters(
    @Query(new ZodValidationPipe(listAllRecruitersQuerySchema))
    query: ListAllRecruitersQueryDto
  ): Promise<ListAllRecruitersResponseDto> {
    const { data, meta } =
      await this.adminCompanyService.listAllRecruiters(query);
    return { success: true, data, meta };
  }

  /**
   * Create Company
   * POST /api/v1/admin/companies
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCompany(
    @Body(new ZodValidationPipe(createCompanySchema))
    dto: CreateAdminCompanyDto
  ): Promise<AdminCompanyResponseDto> {
    const data = await this.adminCompanyService.createCompany(dto);
    return { success: true, data };
  }

  /**
   * Update Company
   * PATCH /api/v1/admin/companies/:id
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateCompany(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(updateCompanySchema))
    dto: UpdateAdminCompanyDto
  ): Promise<AdminCompanyResponseDto> {
    const data = await this.adminCompanyService.updateCompany(id, dto);
    return { success: true, data };
  }

  /**
   * Assign Company to Recruiter
   * PATCH /api/v1/admin/companies/recruiters/:recruiterId/assign
   */
  @Patch('recruiters/:recruiterId/assign')
  @HttpCode(HttpStatus.OK)
  async assignRecruiterCompany(
    @Param('recruiterId', uuidPipe) recruiterId: string,
    @Body(new ZodValidationPipe(assignRecruiterCompanySchema))
    dto: AssignRecruiterCompanyDto
  ): Promise<AssignRecruiterCompanyResponseDto> {
    const data = await this.adminCompanyService.assignRecruiterCompany(
      recruiterId,
      dto
    );
    return { success: true, data };
  }
}
