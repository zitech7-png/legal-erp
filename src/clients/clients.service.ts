import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async createClient(tenantId: string, dto: CreateClientDto) {
    const displayName = dto.displayName.trim();
    const normalizedName = dto.normalizedName.trim().toLowerCase();
    const status = dto.status.trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantId}::text,
          true
        )
      `;

      return tx.client.create({
        data: {
          tenantId,
          clientType: dto.clientType,
          displayName,
          normalizedName,
          billingContactId: dto.billingContactId ?? null,
          status,
        },
        select: {
          id: true,
          tenantId: true,
          clientType: true,
          displayName: true,
          normalizedName: true,
          billingContactId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }

  async listClients(
    tenantId: string,
    pagination: PaginationDto,
  ) {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantId}::text,
          true
        )
      `;

      const [items, total] = await Promise.all([
        tx.client.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          select: {
            id: true,
            tenantId: true,
            clientType: true,
            displayName: true,
            normalizedName: true,
            billingContactId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        tx.client.count({
          where: { tenantId },
        }),
      ]);

      return {
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    });
  }
}
