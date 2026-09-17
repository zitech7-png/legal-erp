import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProceedingDto } from './dto/create-proceeding.dto';

@Injectable()
export class ProceedingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProceeding(
    tenantId: string,
    dto: CreateProceedingDto,
  ) {
    const caseNumber = dto.caseNumber?.trim() || null;
    const filingDiaryNumber =
      dto.filingDiaryNumber?.trim() || null;
    const status = dto.status.trim().toLowerCase();

    if (
      dto.platformCaseTypeId &&
      dto.tenantCaseTypeId
    ) {
      throw new BadRequestException(
        'Provide either platformCaseTypeId or tenantCaseTypeId, not both',
      );
    }

    if (
      !dto.platformCaseTypeId &&
      !dto.tenantCaseTypeId
    ) {
      throw new BadRequestException(
        'One of platformCaseTypeId or tenantCaseTypeId is required',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'app.current_tenant',
          ${tenantId}::text,
          true
        )
      `;

      const matter = await tx.matter.findFirst({
        where: {
          id: dto.matterId,
          tenantId,
        },
        select: { id: true },
      });

      if (!matter) {
        throw new NotFoundException('Matter not found');
      }

      const courtForum = await tx.courtForum.findFirst({
  where: { id: dto.courtForumId },
  select: {
    id: true,
    forumTypeId: true,
  },
});

      if (!courtForum) {
        throw new NotFoundException('Court forum not found');
      }

      if (dto.benchId) {
        const bench = await tx.bench.findFirst({
          where: {
            id: dto.benchId,
            courtForumId: dto.courtForumId,
          },
          select: { id: true },
        });

        if (!bench) {
          throw new BadRequestException(
            'Bench does not belong to the selected court forum',
          );
        }
      }

      if (dto.platformCaseTypeId) {
        const caseType = await tx.caseType.findFirst({
        where: {
           id: dto.platformCaseTypeId,
           forumTypeId: courtForum.forumTypeId,
         },
         select: { id: true },
       });

        if (!caseType) {
          throw new BadRequestException(
            'Platform case type is invalid',
          );
        }
      }

      if (dto.tenantCaseTypeId) {
        const tenantCaseType =
          await tx.tenantCaseType.findFirst({
            where: {
              id: dto.tenantCaseTypeId,
              tenantId,
            },
            select: { id: true },
          });

        if (!tenantCaseType) {
          throw new BadRequestException(
            'Tenant case type is invalid',
          );
        }
      }

      let filingDate: Date | null = null;

      if (dto.filingDate) {
        filingDate = new Date(dto.filingDate);

        if (Number.isNaN(filingDate.getTime())) {
          throw new BadRequestException(
            'Invalid filingDate',
          );
        }
      }

      return tx.proceeding.create({
        data: {
          tenantId,
          matterId: dto.matterId,
          courtForumId: dto.courtForumId,
          benchId: dto.benchId ?? null,
          platformCaseTypeId:
            dto.platformCaseTypeId ?? null,
          tenantCaseTypeId:
            dto.tenantCaseTypeId ?? null,
          caseNumber,
          filingDiaryNumber,
          filingDate,
          externalCaseReferenceId:
            dto.externalCaseReferenceId?.trim() || null,
          physicalFileLocation:
            dto.physicalFileLocation?.trim() || null,
          status,
        },
        select: {
          id: true,
          tenantId: true,
          matterId: true,
          courtForumId: true,
          benchId: true,
          platformCaseTypeId: true,
          tenantCaseTypeId: true,
          caseNumber: true,
          filingDiaryNumber: true,
          filingDate: true,
          externalCaseReferenceId: true,
          physicalFileLocation: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }
}
