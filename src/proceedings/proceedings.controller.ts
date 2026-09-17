import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ProceedingsService } from './proceedings.service';
import { CreateProceedingDto } from './dto/create-proceeding.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    tenantId: string;
  };
}

@Controller('proceedings')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
@RequirePermission('matter.write')
export class ProceedingsController {
  constructor(
    private readonly proceedingsService: ProceedingsService,
  ) {}

  @Post()
  createProceeding(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateProceedingDto,
  ) {
    return this.proceedingsService.createProceeding(
      request.user.tenantId,
      dto,
    );
  }
}
