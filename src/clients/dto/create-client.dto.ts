import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateClientDto {
  @IsIn(['individual', 'organization'])
  clientType!: 'individual' | 'organization';

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  @MinLength(1)
  normalizedName!: string;

  @IsString()
  @MinLength(1)
  status!: string;

  @IsOptional()
  @IsUUID()
  billingContactId?: string;
}
