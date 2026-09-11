import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createCompanySchema } from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CompanyService } from './company.service';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RECRUITER, UserRole.ADMIN)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  /**
   * 3.1 Create Company
   * POST /api/v1/companies
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCompany(
    @Body(new ZodValidationPipe(createCompanySchema))
    dto: CreateCompanyDto
  ): Promise<CompanyResponseDto> {
    const data = await this.companyService.createCompany(dto);
    return {
      success: true,
      data,
    };
  }
}
