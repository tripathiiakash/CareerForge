import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminCompanyItem,
  AdminCompanyPaginationMeta,
  AdminRecruiterListItem,
  AdminRecruiterListMeta,
  AssignRecruiterCompanyResult,
  AssignRecruiterCompanyDto,
  CreateAdminCompanyDto,
  ListAllRecruitersQueryDto,
  ListCompaniesQueryDto,
  UpdateAdminCompanyDto,
} from './dto/admin-company-response.dto';

@Injectable()
export class AdminCompanyService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // List Companies (paginated + optional search)
  // GET /api/v1/admin/companies
  // -------------------------------------------------------------------------
  async listCompanies(query: ListCompaniesQueryDto): Promise<{
    data: AdminCompanyItem[];
    meta: AdminCompanyPaginationMeta;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = query.search
      ? {
          name: {
            contains: query.search.trim(),
            mode: 'insensitive' as const,
          },
        }
      : {};

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        include: {
          _count: { select: { recruiters: true } },
        },
      }),
      this.prisma.company.count({ where }),
    ]);

    const data: AdminCompanyItem[] = companies.map((c) => ({
      id: c.id,
      name: c.name,
      website: c.website,
      logo_url: c.logo_url,
      created_at: c.created_at,
      recruiter_count: c._count.recruiters,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Create Company (admin bypass – skips uniqueness-only-for-recruiter guard)
  // POST /api/v1/admin/companies
  // -------------------------------------------------------------------------
  async createCompany(dto: CreateAdminCompanyDto): Promise<AdminCompanyItem> {
    const trimmedName = dto.name.trim();

    const existing = await this.prisma.company.findFirst({
      where: { name: { equals: trimmedName, mode: 'insensitive' } },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A company with this name already exists',
      });
    }

    const company = await this.prisma.company.create({
      data: {
        name: trimmedName,
        website: dto.website ?? null,
        logo_url: dto.logo_url ?? null,
      },
      include: { _count: { select: { recruiters: true } } },
    });

    return {
      id: company.id,
      name: company.name,
      website: company.website,
      logo_url: company.logo_url,
      created_at: company.created_at,
      recruiter_count: company._count.recruiters,
    };
  }

  // -------------------------------------------------------------------------
  // Update Company
  // PATCH /api/v1/admin/companies/:id
  // -------------------------------------------------------------------------
  async updateCompany(
    id: string,
    dto: UpdateAdminCompanyDto
  ): Promise<AdminCompanyItem> {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Company not found',
      });
    }

    // Name uniqueness check when renaming
    if (dto.name) {
      const trimmedName = dto.name.trim();
      if (trimmedName.toLowerCase() !== company.name.toLowerCase()) {
        const duplicate = await this.prisma.company.findFirst({
          where: {
            name: { equals: trimmedName, mode: 'insensitive' },
            NOT: { id },
          },
        });
        if (duplicate) {
          throw new ConflictException({
            code: 'CONFLICT',
            message: 'A company with this name already exists',
          });
        }
      }
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.logo_url !== undefined && { logo_url: dto.logo_url }),
      },
      include: { _count: { select: { recruiters: true } } },
    });

    return {
      id: updated.id,
      name: updated.name,
      website: updated.website,
      logo_url: updated.logo_url,
      created_at: updated.created_at,
      recruiter_count: updated._count.recruiters,
    };
  }

  // -------------------------------------------------------------------------
  // List All Recruiters (all approval states, optional filter + search)
  // GET /api/v1/admin/companies/recruiters
  // -------------------------------------------------------------------------
  async listAllRecruiters(query: ListAllRecruitersQueryDto): Promise<{
    data: AdminRecruiterListItem[];
    meta: AdminRecruiterListMeta;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.is_approved !== undefined) {
      where.is_approved = query.is_approved;
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { first_name: { contains: term, mode: 'insensitive' } },
        { last_name: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [recruiters, total] = await Promise.all([
      this.prisma.recruiter.findMany({
        where,
        orderBy: [{ user: { created_at: 'desc' } }, { id: 'asc' }],
        skip,
        take: limit,
        include: {
          company: {
            select: { id: true, name: true, website: true, logo_url: true },
          },
          user: {
            select: {
              id: true,
              email: true,
              is_banned: true,
              created_at: true,
            },
          },
        },
      }),
      this.prisma.recruiter.count({ where }),
    ]);

    const data: AdminRecruiterListItem[] = recruiters.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.user?.email || '',
      is_approved: r.is_approved,
      created_at: r.user?.created_at || new Date(),
      company: r.company
        ? {
            id: r.company.id,
            name: r.company.name,
            website: r.company.website,
            logo_url: r.company.logo_url,
          }
        : null,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Assign Company to Recruiter
  // PATCH /api/v1/admin/companies/recruiters/:recruiterId/assign
  // -------------------------------------------------------------------------
  async assignRecruiterCompany(
    recruiterId: string,
    dto: AssignRecruiterCompanyDto
  ): Promise<AssignRecruiterCompanyResult> {
    // Resolve recruiter by recruiter.id OR user_id
    const recruiter = await this.prisma.recruiter.findFirst({
      where: { OR: [{ id: recruiterId }, { user_id: recruiterId }] },
    });
    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    // Validate the target company exists
    const company = await this.prisma.company.findUnique({
      where: { id: dto.company_id },
    });
    if (!company) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Company not found',
      });
    }

    await this.prisma.recruiter.update({
      where: { id: recruiter.id },
      data: { company_id: dto.company_id },
    });

    return {
      recruiter_id: recruiter.id,
      company_id: company.id,
      company_name: company.name,
      message: `Recruiter successfully associated with "${company.name}"`,
    };
  }
}
