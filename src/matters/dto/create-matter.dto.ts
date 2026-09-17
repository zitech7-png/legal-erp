import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateMatterDto {
  @IsString()
  @MinLength(1)
  matterNumber!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsUUID()
  clientId!: string;

  @IsUUID()
  officeId!: string;

  @IsOptional()
  @IsUUID()
  practiceAreaId?: string;

  @IsOptional()
  @IsUUID()
  responsibleAttorneyId?: string;

  @IsString()
  @MinLength(1)
  status!: string;

  @IsOptional()
  @IsDateString()
  openedDate?: string;

  @IsOptional()
  @IsDateString()
  closedDate?: string;
}