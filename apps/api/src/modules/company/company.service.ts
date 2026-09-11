import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyData } from './dto/company-response.dto';
import { CreateCompanyDto } from './dto/create-company.dto';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new company record adhering to docs/API.md §3.1.
   * Ensures internal database metadata (e.g. created_at) is never exposed.
   */
  async createCompany(dto: CreateCompanyDto): Promise<CompanyData> {
    const trimmedName = dto.name.trim();

    // Enforce uniqueness check per docs/API.md §3.1 (409 CONFLICT)
    const existing = await this.prisma.company.findFirst({
      where: {
        name: {
          equals: trimmedName,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Company with this name already exists',
      });
    }

    const company = await this.prisma.company.create({
      data: {
        name: trimmedName,
        website: dto.website ? dto.website.trim() : null,
        logo_url: dto.logo_url ? dto.logo_url.trim() : null,
      },
      select: {
        id: true,
        name: true,
        website: true,
        logo_url: true,
      },
    });

    return {
      id: company.id,
      name: company.name,
      website: company.website,
      logo_url: company.logo_url,
    };
  }
}
