import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Response } from 'express';
import { loginSchema, registerSchema } from '@careerforge/validation';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { ConfigService } from '../../core/config/config.service';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { clearAuthCookie, setAuthCookie } from '../../core/utils/cookie.util';
import { AuthService } from './auth.service';
import { AuthPublicResponseData, AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  /**
   * 1.1 Register User
   * POST /api/v1/auth/register
   * Sets HttpOnly auth cookie. JWT is NOT returned in the response body.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({
    limit: 10,
    ttlSeconds: 60,
    keyPrefix: 'auth',
    message: 'Too many registration attempts. Please try again later.',
  })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthResponseDto> {
    const result = await this.authService.register(dto);
    setAuthCookie(res, result.token, this.configService);

    const data: AuthPublicResponseData = {
      user_id: result.user_id,
      email: result.email,
      role: result.role,
    };
    return { success: true, data };
  }

  /**
   * 1.2 Login User
   * POST /api/v1/auth/login
   * Sets HttpOnly auth cookie. JWT is NOT returned in the response body.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    limit: 10,
    ttlSeconds: 60,
    keyPrefix: 'auth',
    message: 'Too many login attempts. Please try again later.',
  })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(dto);
    setAuthCookie(res, result.token, this.configService);

    const data: AuthPublicResponseData = {
      user_id: result.user_id,
      email: result.email,
      role: result.role,
    };
    return { success: true, data };
  }

  /**
   * 1.3 Logout User
   * POST /api/v1/auth/logout
   * Clears the HttpOnly auth cookie. Works whether cookie was present or absent.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Res({ passthrough: true }) res: Response
  ): Promise<{ success: true }> {
    clearAuthCookie(res, this.configService);
    return { success: true };
  }

  /**
   * 1.4 Session Rehydration / Get Current Authenticated User
   * GET /api/v1/auth/me
   * Returns current authenticated user claims extracted from the verified HttpOnly cookie.
   * Used by the frontend to restore auth state after a browser refresh.
   * Protected by JwtAuthGuard — returns 401 if unauthenticated or expired.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  me(
    @CurrentUser() user: AuthenticatedUser
  ): { success: true; data: AuthPublicResponseData } {
    return {
      success: true,
      data: {
        user_id: user.userId,
        email: user.email,
        role: user.role,
      },
    };
  }
}
