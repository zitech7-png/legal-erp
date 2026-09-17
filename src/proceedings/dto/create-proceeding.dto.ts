import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateProceedingDto {
  @IsUUID()
  matterId!: string;

  @IsUUID()
  courtForumId!: string;

  @IsOptional()
  @IsUUID()
  benchId?: string;

  @IsOptional()
  @IsUUID()
  platformCaseTypeId?: string;

  @IsOptional()
  @IsUUID()
  tenantCaseTypeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  caseNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  filingDiaryNumber?: string;

  @IsOptional()
  filingDate?: string;

  @IsOptional()
  @IsString()
  externalCaseReferenceId?: string;

  @IsOptional()
  @IsString()
  physicalFileLocation?: string;

  @IsString()
  @MinLength(1)
  status!: string;
}
