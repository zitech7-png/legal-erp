import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantId}::text,
          true
        )
      `;

      return tx.user.findMany({
        where: {
          tenantId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          tenantId: true,
          email: true,
          fullName: true,
          userType: true,
          status: true,
          primaryOfficeId: true,
          createdAt: true,
        },
      });
    });
  }

  async listRoles(tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantId}::text,
          true
        )
      `;

      return tx.role.findMany({
        where: {
          tenantId,
        },
        orderBy: {
          name: 'asc',
        },
        select: {
          id: true,
          tenantId: true,
          name: true,
          isSystemDefault: true,
          appliesToUserType: true,
          rolePermissions: {
            select: {
              permission: {
                select: {
                  key: true,
                  description: true,
                  category: true,
                },
              },
            },
          },
        },
      });
    });
  }

  async assignRole(
    tenantId: string,
    userId: string,
    roleId: string,
    officeId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantId}::text,
          true
        )
      `;

      const user = await tx.user.findFirst({
        where: {
          id: userId,
          tenantId,
        },
        select: {
          id: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const role = await tx.role.findFirst({
        where: {
          id: roleId,
          tenantId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!role) {
        throw new Error('Role not found');
      }

      const existing = await tx.userRole.findFirst({
        where: {
          tenantId,
          userId,
          roleId,
          officeId: officeId ?? null,
        },
      });

      if (!existing) {
        await tx.userRole.create({
          data: {
            tenantId,
            userId,
            roleId,
            officeId: officeId ?? null,
          },
        });
      }

      return {
        userId,
        roleId: role.id,
        roleName: role.name,
        officeId: officeId ?? null,
      };
    });
  }

  async createUser(tenantId: string, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();

    const { hash } = await import('argon2');

    const passwordHash = await hash(dto.password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT set_config(
            'app.current_tenant',
            ${tenantId}::text,
            true
          )
        `;

        const user = await tx.user.create({
          data: {
            tenantId,
            email,
            passwordHash,
            userType: dto.userType,
            fullName,
            status: 'active',
          },
          select: {
            id: true,
            tenantId: true,
            email: true,
            fullName: true,
            userType: true,
            status: true,
            primaryOfficeId: true,
            createdAt: true,
          },
        });

        return user;
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A user with this email already exists',
        );
      }

      throw error;
    }
  }
}