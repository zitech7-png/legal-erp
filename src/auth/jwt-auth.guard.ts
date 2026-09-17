import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    try {
      const { jwtVerify } = await import('jose');

      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(jwtSecret),
        {
          algorithms: ['HS256'],
        },
      );

      if (
        typeof payload.sub !== 'string' ||
        typeof payload.tenantId !== 'string'
      ) {
        throw new UnauthorizedException('Invalid token claims');
      }

      request.user = payload;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
