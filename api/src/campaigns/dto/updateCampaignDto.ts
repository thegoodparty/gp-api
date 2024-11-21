import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean } from 'class-validator'

export class UpdateCampaignDto {
  @IsBoolean()
  @ApiProperty()
  isDemo: boolean

  @IsBoolean()
  @ApiProperty()
  isActive: boolean
}
