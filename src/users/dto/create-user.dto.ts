import {
  IsEmail,
  IsIn,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(['staff', 'client'])
  userType!: 'staff' | 'client';
}