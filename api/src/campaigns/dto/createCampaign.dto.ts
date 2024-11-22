import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsBoolean } from 'class-validator'

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
