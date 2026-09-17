import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveBySubdomain(subdomain: string) {
    const normalizedSubdomain = subdomain.trim().toLowerCase();

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        subdomain: normalizedSubdomain,
        status: 'active',
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        status: true,
      },
    });

    if (!tenant) {
      throw new UnauthorizedException('Invalid tenant');
    }

    return tenant;
  }
}
