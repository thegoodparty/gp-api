import { Injectable } from '@nestjs/common'
import { Client } from '@hubspot/api-client'
const { HUBSPOT_TOKEN } = process.env

@Injectable()
export class HubspotService {
  public client = new Client({ accessToken: HUBSPOT_TOKEN })
}
