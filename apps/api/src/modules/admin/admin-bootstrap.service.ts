import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { adminBootstrapSchema, AdminBootstrapInput } from '@careerforge/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';

export interface BootstrapAdminResult {
  status: 'CREATED' | 'EXISTS';
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Injectable()
export class AdminBootstrapService {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService
  ) {}

  /**
   * Securely bootstraps the initial administrator account.
   * - Validates email and password policy.
   * - Idempotent: returns status 'EXISTS' if an admin account already exists with this email.
   * - Refuses to elevate or overwrite non-admin accounts (STUDENT, RECRUITER).
   * - Plaintext passwords are never logged or returned.
   */
  async bootstrapAdmin(input: AdminBootstrapInput): Promise<BootstrapAdminResult> {
    const parseResult = adminBootstrapSchema.safeParse(input);

    if (!parseResult.success) {
      const details = parseResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message,
      }));

      const primaryMessage =
        details.length > 0
          ? `${details[0].field}: ${details[0].issue}`
          : 'Validation failed';

      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: primaryMessage,
        details,
      });
    }

    const { email, password } = parseResult.data;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (existingUser) {
      if (existingUser.role === UserRole.ADMIN) {
        this.logger.log(`Admin account already exists for ${email} (ID: ${existingUser.id})`);
        return {
          status: 'EXISTS',
          user: existingUser,
        };
      }

      throw new ConflictException({
        code: 'CONFLICT',
        message: `User with email '${email}' already exists with role '${existingUser.role}'. Automatic elevation to ADMIN is prohibited.`,
      });
    }

    // Hash password with platform standard bcrypt rounds (10)
    const passwordHash = await this.passwordService.hash(password);

    // Create the admin user record
    const createdUser = await this.prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        role: UserRole.ADMIN,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    this.logger.log(`Admin account successfully bootstrapped for ${email} (ID: ${createdUser.id})`);

    return {
      status: 'CREATED',
      user: createdUser,
    };
  }
}
