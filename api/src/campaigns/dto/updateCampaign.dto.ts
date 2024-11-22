import { BadRequestException } from '@nestjs/common'
import { ApiProperty } from '@nestjs/swagger'
import { Campaign } from '@prisma/client'
import { Transform } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'

const tramsformFn = ({ value }) => {
  try {
    return JSON.parse(value)
  } catch (e) {
    throw new BadRequestException('Invalid JSON field', { cause: e })
  }
}

export class UpdateCampaignDto implements Partial<Campaign> {
  @ApiProperty()
  @IsOptional()
  @Transform(tramsformFn)
  @IsObject()
  data: object

  @ApiProperty()
  @IsOptional()
  @Transform(tramsformFn)
  @IsObject()
  details: object

  @ApiProperty()
  @IsOptional()
  @Transform(tramsformFn)
  @IsObject()
  pathToVictory: object
}
