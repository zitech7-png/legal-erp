import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantResolutionService } from './tenant-resolution.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantResolution: TenantResolutionService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    const argon2 = await import('argon2');
    return argon2.hash(password);
  }

  async verifyPassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    const argon2 = await import('argon2');
    return argon2.verify(passwordHash, password);
  }

  async login(
    subdomain: string,
    email: string,
    password: string,
  ) {
    const tenant =
      await this.tenantResolution.resolveBySubdomain(subdomain);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenant.id}::text,
          true
        )
      `;

      const user = await tx.user.findFirst({
        where: {
          tenantId: tenant.id,
          email: email.trim().toLowerCase(),
          status: 'active',
        },
        select: {
          id: true,
          tenantId: true,
          email: true,
          passwordHash: true,
          userType: true,
          status: true,
          primaryOfficeId: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const passwordValid = await this.verifyPassword(
        password,
        user.passwordHash,
      );

      if (!passwordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      return {
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          userType: user.userType,
          status: user.status,
          primaryOfficeId: user.primaryOfficeId,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          status: tenant.status,
        },
      };
    });

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const { SignJWT } = await import('jose');

    const token = await new SignJWT({
      tenantId: result.user.tenantId,
      userType: result.user.userType,
      primaryOfficeId: result.user.primaryOfficeId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(result.user.id)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(jwtSecret));

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: result.user,
      tenant: result.tenant,
    };
  }
}
