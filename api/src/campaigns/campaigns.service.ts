import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import {
  CampaignListQuery,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './campaigns.dto'

@Injectable()
export class CampaignsService {
  constructor(private prismaService: PrismaService) {}

  findAll(query: CampaignListQuery) {
    if (Object.values(query).every((value) => !value)) {
      return this.prismaService.campaign.findMany()
    } else {
      const rawQuery = this.buildCustomCampaignListQuery(query)

      console.log(rawQuery)

      return this.prismaService.$queryRawUnsafe(rawQuery)
    }
  }

  findOne(id: number) {
    return this.prismaService.campaign.findFirst({ where: { id } })
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

  private buildCustomCampaignListQuery({
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
  }) {
    return `
    SELECT
      c.*
      -- u."firstName" as "firstName",
      -- u."lastName" as "lastName",
      -- u.phone as "phone",
      -- u.email as "email",
      -- u."metaData",
      -- p.data as "pathToVictory"
    FROM public.campaign AS c
    -- JOIN public."user" AS u ON u.id = c.user
    -- LEFT JOIN public."pathtovictory" as p ON p.id = c."pathToVictory"
    -- WHERE c.user IS NOT NULL
    WHERE c.id IS NOT NULL
    ${this.buildQueryWhereClause({
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
  }

  private buildQueryWhereClause({
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
  }) {
    return `
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
  }
}
