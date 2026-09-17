import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { MattersService } from './matters.service';
import { CreateMatterDto } from './dto/create-matter.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    tenantId: string;
  };
}

@Controller('matters')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
@RequirePermission('matter.write')
export class MattersController {
  constructor(private readonly mattersService: MattersService) {}

  @Post()
  createMatter(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateMatterDto,
  ) {
    return this.mattersService.createMatter(
      request.user.tenantId,
      dto,
    );
  }
}