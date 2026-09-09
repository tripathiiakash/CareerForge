import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthResponseData } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService
  ) {}

  /**
   * Registers a new user account (STUDENT or RECRUITER) adhering to docs/API.md §1.1.
   */
  async register(dto: RegisterDto): Promise<AuthResponseData> {
    const email = dto.email.trim().toLowerCase();

    // Defense-in-depth: registration as ADMIN is prohibited
    if ((dto.role as string) === 'ADMIN') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Registration as ADMIN is not permitted',
      });
    }

    // Check for duplicate email
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Email is already registered',
      });
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    // Create user and initial profile record atomically
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          password_hash: passwordHash,
          role: dto.role as UserRole,
        },
      });

      if (dto.role === 'STUDENT') {
        await tx.student.create({
          data: {
            user_id: createdUser.id,
            first_name: '',
            last_name: '',
          },
        });
      } else if (dto.role === 'RECRUITER') {
        await tx.recruiter.create({
          data: {
            user: { connect: { id: createdUser.id } },
            first_name: '',
            last_name: '',
            company: {
              create: {
                name: '',
              },
            },
          },
        });
      }

      return createdUser;
    });

    const token = await this.tokenService.signToken(user);

    return {
      user_id: user.id,
      email: user.email,
      role: user.role,
      token,
    };
  }

  /**
   * Authenticates user with email and password adhering to docs/API.md §1.2.
   */
  async login(dto: LoginDto): Promise<AuthResponseData> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Constant-time dummy compare if user does not exist to prevent timing attacks
    if (!user) {
      await this.passwordService.dummyCompare(dto.password);
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
      });
    }

    // Check if user has been suspended/banned by an administrator
    if (user.is_banned) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Your account has been suspended. Contact support.',
      });
    }

    const passwordMatches = await this.passwordService.compare(
      dto.password,
      user.password_hash
    );

    if (!passwordMatches) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
      });
    }

    const token = await this.tokenService.signToken(user);

    return {
      user_id: user.id,
      email: user.email,
      role: user.role,
      token,
    };
  }
}
