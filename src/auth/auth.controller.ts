import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RequirePermission } from './decorators/require-permission.decorator';
import { RbacPermissionGuard } from './guards/rbac-permission.guard';
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(
      dto.subdomain,
      dto.email,
      dto.password,
    );
  }
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() request: any) {
    return {
      authenticated: true,
      userId: request.user.sub,
      tenantId: request.user.tenantId,
      userType: request.user.userType,
      primaryOfficeId: request.user.primaryOfficeId ?? null,
    };
  }
}
