import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
} from '@nestjs/common';
import { loginSchema, registerSchema } from '@careerforge/validation';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 1.1 Register User
   * POST /api/v1/auth/register
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
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    const data = await this.authService.register(dto);
    return {
      success: true,
      data,
    };
  }

  /**
   * 1.2 Login User
   * POST /api/v1/auth/login
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
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    const data = await this.authService.login(dto);
    return {
      success: true,
      data,
    };
  }
}
