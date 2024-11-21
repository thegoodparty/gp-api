import { ApiProperty } from '@nestjs/swagger'
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsNumber,
  IsDate,
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
  @IsDate()
  level: string

  @ApiProperty()
  @IsOptional()
  @IsDate()
  primaryElectionDateStart: Date

  @ApiProperty()
  @IsOptional()
  @IsDate()
  primaryElectionDateEnd: Date

  @ApiProperty()
  @IsOptional()
  @IsString()
  campaignStatus: string

  @ApiProperty()
  @IsOptional()
  @IsDate()
  generalElectionDateStart: Date

  @ApiProperty()
  @IsOptional()
  @IsDate()
  generalElectionDateEnd: Date

  @ApiProperty()
  @IsOptional()
  @IsString()
  p2vStatus: string
}

const stuff = {
  inputs: {
    id: { type: 'number' },
    state: {
      type: 'string',
    },
    slug: {
      type: 'string',
    },
    email: {
      // can be partial
      type: 'string',
    },
    level: {
      type: 'string',
    },
    primaryElectionDateStart: {
      type: 'string',
    },
    primaryElectionDateEnd: {
      type: 'string',
    },
    campaignStatus: {
      type: 'string',
    },
    generalElectionDateStart: {
      type: 'string',
    },
    generalElectionDateEnd: {
      type: 'string',
    },
    p2vStatus: {
      type: 'string',
    },
  },
}
