import { RbacPermissionGuard } from './guards/rbac-permission.guard';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TenantResolutionService } from './tenant-resolution.service';

@Module({
  controllers: [AuthController],
  providers: [
  AuthService,
  TenantResolutionService,
  RbacPermissionGuard,
],
  exports: [AuthService, TenantResolutionService],
})
export class AuthModule {}
