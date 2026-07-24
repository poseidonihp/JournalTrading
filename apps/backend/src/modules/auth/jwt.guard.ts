import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import type { AuthenticatedUser } from './auth.dto';

interface RequestWithCookies {
  cookies?: Record<string, string>;
  headers?: { authorization?: string };
  user?: AuthenticatedUser;
}

export const ACCESS_COOKIE = 'journal_access';
export const REFRESH_COOKIE = 'journal_refresh';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithCookies>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Token ausente');

    request.user = await this.auth.validateAccessToken(token);
    return true;
  }

  private extractToken(req: RequestWithCookies): string | null {
    const fromCookie = req.cookies?.[ACCESS_COOKIE];
    if (fromCookie) return fromCookie;
    const auth = req.headers?.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return null;
  }
}
