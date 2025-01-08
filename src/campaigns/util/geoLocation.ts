import { Campaign } from '@prisma/client'
import { PrismaService } from 'src/prisma/prisma.service'
import { zipToLatLng } from './zipToLatLng'

export async function handleGeoLocation(
  campaign: Campaign,
  forceReCalc: boolean | undefined,
  prismaService: PrismaService,
): Promise<{ lat: number; lng: number } | null> {
  const details = campaign.details
  const { geoLocationFailed, geoLocation } = details || {}

  if (!forceReCalc && geoLocationFailed) {
    return null
  }

  if (forceReCalc || !geoLocation?.lng) {
    const geoLocation = await calculateGeoLocation(campaign, prismaService)
    if (!geoLocation) {
      await prismaService.campaign.update({
        where: {
          slug: campaign.slug,
        },
        data: {
          details: {
            ...details,
            geoLocationFailed: true,
          },
        },
      })
      return null
    }
    return { lng: geoLocation.lng, lat: geoLocation.lat }
  } else if (geoLocation?.lng && geoLocation?.lat) {
    return {
      lng: geoLocation?.lng,
      lat: geoLocation?.lat,
    }
  } else return null
}

export async function calculateGeoLocation(
  campaign: Campaign,
  prismaService: PrismaService,
): Promise<{ lat: number; lng: number; geoHash: string } | null> {
  if (!campaign.details?.zip || !campaign.details?.state) {
    return null
  }
  const globalCoords = await zipToLatLng(
    campaign.details?.zip,
    campaign.details?.state,
  )
  if (globalCoords == null) {
    return null
  }
  const { lat, lng, geoHash } = globalCoords
  await prismaService.campaign.update({
    where: {
      slug: campaign.slug,
    },
    data: {
      details: {
        ...campaign.details,
        geoLocationFailed: false,
        geoLocation: {
          geoHash,
          lat,
          lng,
        },
      },
    },
  })
  return { lng, lat, geoHash }
}
