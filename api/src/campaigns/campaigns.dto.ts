import { IsBoolean, IsInt, IsNotEmpty } from 'class-validator'

export class CreateCampaignDto {
  @IsNotEmpty()
  slug: string

  @IsBoolean()
  isDemo: boolean = false

  @IsBoolean()
  isAdmin: boolean = false
}

export class GetCampaignParams {
  @IsInt()
  id: number
}
