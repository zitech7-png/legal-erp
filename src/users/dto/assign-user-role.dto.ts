import { IsOptional, IsUUID } from 'class-validator';

export class AssignUserRoleDto {
  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;
}