import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    tenantId: string;
  };
}

@Controller('clients')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
@RequirePermission('client.write')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  createClient(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateClientDto,
  ) {
    return this.clientsService.createClient(
      request.user.tenantId,
      dto,
    );
  }

  @Get()
  listClients(
    @Req() request: AuthenticatedRequest,
    @Query() pagination: PaginationDto,
  ) {
    return this.clientsService.listClients(
      request.user.tenantId,
      pagination,
    );
  }
}
