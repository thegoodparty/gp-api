import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsNumber,
  IsIn,
  IsDateString,
} from 'class-validator'
import { IsState } from 'src/shared/validations/isState'

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  slug: string

  @IsBoolean()
  @ApiProperty()
  isDemo: boolean = false

  @IsBoolean()
  @ApiProperty()
  isActive: boolean = false
}

export class UpdateCampaignDto {
  @IsBoolean()
  @ApiProperty()
  isDemo: boolean

  @IsBoolean()
  @ApiProperty()
  isActive: boolean
}

export class CampaignListQuery {
  @ApiProperty()
  @IsOptional()
  @IsNumber()
  id: number

  @ApiProperty()
  @IsOptional()
  @IsState()
  state: string

  @ApiProperty()
  @IsOptional()
  @IsEmail()
  email: string

  @ApiProperty()
  @IsOptional()
  @IsString()
  slug: string

  @ApiProperty()
  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn(['LOCAL', 'CITY', 'COUNTY', 'STATE', 'FEDERAL'])
  level: string

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  primaryElectionDateStart: string

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  primaryElectionDateEnd: string

  @ApiProperty()
  @IsOptional()
  @IsIn(['active', 'inactive'])
  campaignStatus: string

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  generalElectionDateStart: string

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  generalElectionDateEnd: string

  @ApiProperty()
  @IsOptional()
  @IsString()
  p2vStatus: string
}
