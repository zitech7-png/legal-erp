import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatterDto } from './dto/create-matter.dto';

@Injectable()
export class MattersService {
  constructor(private readonly prisma: PrismaService) {}

  async createMatter(tenantId: string, dto: CreateMatterDto) {
    const matterNumber = dto.matterNumber.trim();
    const title = dto.title.trim();
    const status = dto.status.trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantId}::text,
          true
        )
      `;

      return tx.matter.create({
        data: {
          tenantId,
          matterNumber,
          title,
          clientId: dto.clientId,
          officeId: dto.officeId,
          practiceAreaId: dto.practiceAreaId ?? null,
          responsibleAttorneyId:
            dto.responsibleAttorneyId ?? null,
          status,
          openedDate: dto.openedDate
            ? new Date(dto.openedDate)
            : null,
          closedDate: dto.closedDate
            ? new Date(dto.closedDate)
            : null,
        },
        select: {
          id: true,
          tenantId: true,
          matterNumber: true,
          title: true,
          clientId: true,
          officeId: true,
          practiceAreaId: true,
          responsibleAttorneyId: true,
          status: true,
          openedDate: true,
          closedDate: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }
}