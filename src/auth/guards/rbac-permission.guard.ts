import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class RbacPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<string>(
      REQUIRED_PERMISSION_KEY,
      context.getHandler(),
    );

    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (
      !user ||
      typeof user.sub !== 'string' ||
      typeof user.tenantId !== 'string'
    ) {
      throw new ForbiddenException('Authenticated user context is required');
    }

    const hasPermission = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${user.tenantId}::text,
          true
        )
      `;

      const userRole = await tx.userRole.findFirst({
        where: {
          tenantId: user.tenantId,
          userId: user.sub,
          role: {
            rolePermissions: {
              some: {
                permission: {
                  key: permission,
                },
              },
            },
          },
        },
        select: {
          id: true,
        },
      });

      return userRole !== null;
    });

    if (!hasPermission) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }

    return true;
  }
}
