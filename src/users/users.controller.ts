import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    tenantId: string;
  };
}

@Controller('users')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
@RequirePermission('user.manage_roles')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(@Req() request: AuthenticatedRequest) {
    return this.usersService.listUsers(request.user.tenantId);
  }

  @Post()
  createUser(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.createUser(
      request.user.tenantId,
      dto,
    );
  }
@Get('roles')
async listRoles(@Req() request: AuthenticatedRequest) {
  return this.usersService.listRoles(request.user.tenantId);
}
@Post(':userId/roles')
async assignRole(
  @Req() request: AuthenticatedRequest,
  @Param('userId') userId: string,
  @Body() body: { roleId: string; officeId?: string },
) {
  return this.usersService.assignRole(
    request.user.tenantId,
    userId,
    body.roleId,
    body.officeId,
  );
}
}