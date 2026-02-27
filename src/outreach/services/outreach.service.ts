import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Campaign, OutreachStatus, OutreachType } from '@prisma/client'
import { AreaCodeFromZipService } from 'src/ai/util/areaCodeFromZip.util'
import { CampaignTcrComplianceService } from 'src/campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { DateFormats, formatDate } from 'src/shared/util/date.util'
import { GooglePlacesService } from 'src/vendors/google/services/google-places.service'
import { PeerlyP2pJobService } from 'src/vendors/peerly/services/peerlyP2pJob.service'
import { Readable } from 'stream'
import { CreateOutreachSchema } from '../schemas/createOutreachSchema'
import {
  resolveP2pJobGeography as resolveP2pJobGeographyUtil,
  type P2pJobGeographyResult,
} from '../util/campaignGeography.util'
import { resolveScriptContent } from '../util/resolveScriptContent.util'

export type { P2pJobGeographyResult } from '../util/campaignGeography.util'

/** Image payload for P2P outreach (decoupled from HTTP FileUpload). */
export interface P2pOutreachImageInput {
  stream: Buffer | Readable
  filename: string
  mimetype: string
}

@Injectable()
export class OutreachService extends createPrismaBase(MODELS.Outreach) {
  constructor(
    private readonly placesService: GooglePlacesService,
    private readonly areaCodeFromZipService: AreaCodeFromZipService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
    private readonly peerlyP2pJobService: PeerlyP2pJobService,
  ) {
    super()
  }

  private async createP2pOutreach(
    campaign: Campaign,
    createOutreachDto: CreateOutreachSchema,
    p2pImage: P2pOutreachImageInput,
    imageUrl: string,
    script: string,
    phoneListId: number,
  ) {
    try {
      const { peerlyIdentityId } =
        await this.tcrComplianceService.findFirstOrThrow({
          where: {
            campaignId: campaign.id,
          },
        })

      if (!peerlyIdentityId) {
        throw new BadRequestException(
          'TCR Compliance Peerly identity ID is required for P2P outreach',
        )
      }

      const name = `${campaign.slug}${
        createOutreachDto.date
          ? ` - ${formatDate(createOutreachDto.date, DateFormats.usIsoSlashes)}`
          : ''
      }`

      const { aiContent = {} } = campaign
      const resolvedScriptText = resolveScriptContent(script, aiContent)

      const resolvedGeography = await this.resolveP2pJobGeography(campaign)
      const didState = createOutreachDto.didState ?? resolvedGeography.didState
      const didNpaSubset =
        createOutreachDto.didNpaSubset ?? resolvedGeography.didNpaSubset

      const jobId = await this.peerlyP2pJobService.createPeerlyP2pJob({
        campaignId: campaign.id,
        crmCompanyId: campaign.data?.hubspotId,
        listId: phoneListId,
        imageInfo: {
          fileStream: p2pImage.stream,
          fileName: p2pImage.filename,
          mimeType: p2pImage.mimetype,
          title: createOutreachDto.title,
        },
        scriptText: resolvedScriptText,
        identityId: peerlyIdentityId,
        name,
        didState,
        didNpaSubset,
        scheduledDate: createOutreachDto.date,
      })

      return await this.createRecord(
        {
          ...createOutreachDto,
          script: resolvedScriptText,
          projectId: jobId,
          status: OutreachStatus.in_progress,
          didState,
          didNpaSubset,
        },
        imageUrl,
      )
    } catch (error) {
      this.logger.error({ error }, 'Failed to create P2P outreach')
      if (error instanceof HttpException) {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new BadRequestException(
        `Failed to create P2P outreach: ${message}`,
        { cause: error },
      )
    }
  }

  /**
   * Single entry point for creating outreach (text or P2P).
   * When outreachType is p2p, imageUrl and p2pImage are required and the TCR/geography/Peerly flow runs.
   * Guard: never create a plain record for P2P — require p2pImage so TCR, geography, and Peerly job run.
   */
  async create(
    campaign: Campaign,
    createOutreachDto: CreateOutreachSchema,
    imageUrl?: string,
    p2pImage?: P2pOutreachImageInput,
  ) {
    const isP2p = createOutreachDto.outreachType === OutreachType.p2p

    if (isP2p) {
      if (!imageUrl) {
        throw new BadRequestException('imageUrl is required for P2P outreach')
      }
      if (!p2pImage) {
        throw new BadRequestException(
          'P2P outreach requires an image with filename and MIME type; cannot create P2P outreach without Peerly job setup',
        )
      }
      if (!createOutreachDto.script) {
        throw new BadRequestException('Script is required for P2P outreach')
      }
      if (!createOutreachDto.phoneListId) {
        throw new BadRequestException(
          'Phone list ID is required for P2P outreach',
        )
      }
      return this.createP2pOutreach(
        campaign,
        createOutreachDto,
        p2pImage,
        imageUrl,
        createOutreachDto.script,
        createOutreachDto.phoneListId,
      )
    }

    return this.createRecord(createOutreachDto, imageUrl)
  }

  /** Persists a single outreach record. Used by both non-P2P and P2P flows. */
  private async createRecord(
    createOutreachDto: CreateOutreachSchema,
    imageUrl?: string,
  ) {
    return await this.model.create({
      data: {
        ...createOutreachDto,
        ...(imageUrl ? { imageUrl } : {}),
      },
      include: {
        voterFileFilter: true,
      },
    })
  }

  async findByCampaignId(campaignId: number) {
    const outreachCampaigns = await this.findMany({
      where: { campaignId },
      include: {
        voterFileFilter: true,
      },
    })

    if (!outreachCampaigns.length) {
      throw new NotFoundException(
        `No outreach campaigns found for campaign ID ${campaignId}`,
      )
    }

    return outreachCampaigns
  }

  async resolveP2pJobGeography(
    campaign: Campaign,
  ): Promise<P2pJobGeographyResult> {
    return resolveP2pJobGeographyUtil(campaign, {
      placesService: this.placesService,
      areaCodeFromZipService: this.areaCodeFromZipService,
      logger: this.logger,
    })
  }
}
