import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.validation';
import type { AuthenticatedUser, JwtPayload } from './auth.dto';

const MILLIS_PER_SECOND = 1000;
const USER_FIELDS = { id: true, email: true, displayName: true } as const;

export interface LoginCredentials {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(dto: LoginCredentials): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    // Cada login abre una nueva familia de refresh tokens.
    const { tokens } = await this.issueTokenPair(user.id, user.email, randomUUID());
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      tokens,
    };
  }

  async validateAccessToken(token: string): Promise<AuthenticatedUser> {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token, { secret: this.accessSecret() });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (payload.type !== 'access') throw new UnauthorizedException('Tipo de token incorrecto');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: USER_FIELDS,
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    return user;
  }

  async refresh(refreshToken: string): Promise<{ user: AuthenticatedUser; tokens: AuthTokens }> {
    const payload = this.verifyRefresh(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
    if (!stored) throw new UnauthorizedException('Refresh token desconocido');

    // Detección de reuso: un token ya revocado/rotado que vuelve a usarse indica
    // robo → invalidamos toda la familia (todas las sesiones derivadas del login).
    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token reutilizado; sesión revocada');
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: USER_FIELDS,
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    // Rotación: emitimos un par nuevo en la misma familia y revocamos el actual.
    const { tokens, refreshJti } = await this.issueTokenPair(user.id, user.email, stored.familyId);
    await this.prisma.refreshToken.update({
      where: { jti: stored.jti },
      data: { revokedAt: new Date(), replacedByJti: refreshJti },
    });
    return { user, tokens };
  }

  /** Revoca la familia del refresh token (logout de esa sesión). Best-effort. */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, { secret: this.refreshSecret() });
    } catch {
      // Token inválido o expirado: no hay nada que revocar.
      return;
    }
    if (payload.type !== 'refresh' || !payload.jti) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      select: { familyId: true },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  private verifyRefresh(refreshToken: string): JwtPayload & { jti: string } {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, { secret: this.refreshSecret() });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
    if (payload.type !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Tipo de token incorrecto');
    }
    return { ...payload, jti: payload.jti };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    familyId: string,
  ): Promise<{ tokens: AuthTokens; refreshJti: string }> {
    const accessToken = this.jwt.sign({ sub: userId, email, type: 'access' } satisfies JwtPayload, {
      secret: this.accessSecret(),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });

    const refreshJti = randomUUID();
    const refreshToken = this.jwt.sign(
      { sub: userId, email, type: 'refresh', jti: refreshJti } satisfies JwtPayload,
      {
        secret: this.refreshSecret(),
        expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
      },
    );

    const decoded = this.jwt.decode<{ exp?: number }>(refreshToken);
    const expiresAt = decoded?.exp ? new Date(decoded.exp * MILLIS_PER_SECOND) : new Date();
    await this.prisma.refreshToken.create({
      data: { userId, familyId, expiresAt, jti: refreshJti },
    });

    return { refreshJti, tokens: { accessToken, refreshToken } };
  }

  private accessSecret(): string {
    return this.config.get('JWT_SECRET', { infer: true });
  }

  private refreshSecret(): string {
    return (
      this.config.get('JWT_REFRESH_SECRET', { infer: true }) ??
      this.config.get('JWT_SECRET', { infer: true })
    );
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
