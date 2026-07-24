import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth.dto';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      throw new Error('No authenticated user on request');
    }
    return request.user;
  },
);
