import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import {
  CampaignListQuery,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './campaigns.dto'

const buildQueryWhereClause = ({
  id,
  state,
  slug,
  email,
  level,
  primaryElectionDateStart,
  primaryElectionDateEnd,
  campaignStatus,
  generalElectionDateStart,
  generalElectionDateEnd,
  p2vStatus,
}) => `
  ${id ? ` AND c.id = ${id}` : ''}
  ${slug ? ` AND c.slug ILIKE '%${slug}%'` : ''}
  ${email ? ` AND u.email ILIKE '%${email}%'` : ''}
  ${state ? ` AND c.details->>'state' = '${state}'` : ''}
  ${level ? ` AND c.details->>'ballotLevel' = '${level.toUpperCase()}'` : ''}
  ${
    campaignStatus
      ? ` AND c.is_active = ${campaignStatus === 'active' ? 'true' : 'false'}`
      : ''
  }
  ${
    primaryElectionDateStart
      ? ` AND c.details->>'primaryElectionDate' >= '${primaryElectionDateStart}'`
      : ''
  }
  ${
    primaryElectionDateEnd
      ? ` AND c.details->>'primaryElectionDate' <= '${primaryElectionDateEnd}'`
      : ''
  }
  ${
    generalElectionDateStart
      ? ` AND c.details->>'electionDate' >= '${generalElectionDateStart}'`
      : ''
  }
  ${
    generalElectionDateEnd
      ? ` AND c.details->>'electionDate' <= '${generalElectionDateEnd}'`
      : ''
  }
  ${p2vStatus ? ` AND p.data->>'p2vStatus' = '${p2vStatus}'` : ''}
`

const buildCustomCampaignListQuery = ({
  id,
  state,
  slug,
  email,
  level,
  primaryElectionDateStart,
  primaryElectionDateEnd,
  campaignStatus,
  generalElectionDateStart,
  generalElectionDateEnd,
  p2vStatus,
}) => `
  SELECT
    c.*,
    u.first_name as "first_name",
    u.last_name as "last_name",
    -- u.phone as "phone",
    u.email as "email",
    -- u."metaData",
    p.data as "pathToVictory"
  FROM public.campaign AS c
  JOIN public.user AS u ON u.id = c.user_id
  LEFT JOIN public.path_to_victory as p ON p.campaign_id = c.id
  WHERE c.user_id IS NOT NULL
  ${buildQueryWhereClause({
    id,
    state,
    slug,
    email,
    level,
    primaryElectionDateStart,
    primaryElectionDateEnd,
    campaignStatus,
    generalElectionDateStart,
    generalElectionDateEnd,
    p2vStatus,
  })}
  ORDER BY c.id DESC;
`

@Injectable()
export class CampaignsService {
  constructor(private prismaService: PrismaService) {}

  findAll(query: CampaignListQuery) {
    if (Object.values(query).every((value) => !value)) {
      // if values are empty get all campaigns
      return this.prismaService.campaign.findMany()
    } else {
      const sql = buildCustomCampaignListQuery(query)

      console.log('SEARCH', sql)

      return this.prismaService.$queryRawUnsafe(sql)
    }
  }

  findOne(query: any) {
    return this.prismaService.campaign.findFirst({ where: query })
  }

  findById(id: number) {
    return this.prismaService.campaign.findFirst({ where: { id } })
  }

  findBySlug(slug: string) {
    return this.prismaService.campaign.findFirst({ where: { slug } })
  }

  create(createCampaignDto: CreateCampaignDto) {
    return this.prismaService.campaign.create({ data: createCampaignDto })
  }

  update(id: number, updateCampaignDto: UpdateCampaignDto) {
    return this.prismaService.campaign.update({
      where: { id },
      data: updateCampaignDto,
    })
  }
}
