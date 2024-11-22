import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  IsIn,
  IsDateString,
} from 'class-validator'
import { IsState } from 'src/shared/validations/isState'

export class CampaignListDto {
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
