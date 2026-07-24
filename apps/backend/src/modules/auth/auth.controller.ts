import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, seconds } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { Env } from '../../config/env.validation';
import { AuthService, type AuthTokens } from './auth.service';
import { CryptoService } from './crypto.service';
import { LoginSchema, type LoginDto, type AuthenticatedUser } from './auth.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './jwt.guard';

interface RequestWithCookies extends FastifyRequest {
  cookies: Record<string, string | undefined>;
}

// Vida de las cookies en segundos (alineadas con los TTL de los JWT).
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const ACCESS_TTL_MINUTES = 15;
const REFRESH_TTL_DAYS = 7;
const ACCESS_COOKIE_MAX_AGE = ACCESS_TTL_MINUTES * SECONDS_PER_MINUTE;
const REFRESH_COOKIE_MAX_AGE =
  REFRESH_TTL_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get('public-key')
  publicKey(): { publicKey: string } {
    return { publicKey: this.crypto.getPublicKeyPem() };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Anti fuerza-bruta: máx. 5 intentos por minuto y por IP.
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ user: AuthenticatedUser }> {
    const password = this.crypto.decryptPassword(dto.encryptedPassword);
    const { user, tokens } = await this.auth.login({ email: dto.email, password });
    this.setAuthCookies(reply, tokens);
    return { user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: seconds(60), limit: 30 } })
  async refresh(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ user: AuthenticatedUser }> {
    const refreshToken = req.cookies[REFRESH_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    const { user, tokens } = await this.auth.refresh(refreshToken);
    this.setAuthCookies(reply, tokens);
    return { user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const refreshToken = req.cookies[REFRESH_COOKIE];
    // Revoca la familia del refresh token para que no pueda reutilizarse.
    if (refreshToken) await this.auth.revokeRefreshToken(refreshToken);
    reply.clearCookie(ACCESS_COOKIE, { path: '/' });
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  private setAuthCookies(reply: FastifyReply, tokens: AuthTokens): void {
    const secure = this.config.get('COOKIE_SECURE', { infer: true });
    const sameSite = this.config.get('COOKIE_SAMESITE', { infer: true });
    const domain = this.config.get('COOKIE_DOMAIN', { infer: true });
    const baseOpts = {
      httpOnly: true,
      signed: false,
      domain: domain || undefined,
      sameSite,
      secure,
    };
    reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
      ...baseOpts,
      path: '/',
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...baseOpts,
      path: '/api/auth',
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
  }
}
