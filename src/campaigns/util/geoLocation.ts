import { PrismaService } from 'src/prisma/prisma.service'
import { zipToLatLng } from './zipToLatLng'

export async function handleGeoLocation(
  slug: string,
  details: PrismaJson.CampaignDetails,
  forceReCalc: boolean | undefined,
  prismaService: PrismaService,
): Promise<{ lat: number; lng: number } | null> {
  const { geoLocationFailed, geoLocation } = details || {}

  if (!forceReCalc && geoLocationFailed) {
    return null
  }

  if (forceReCalc || !geoLocation?.lng) {
    const geoLocation = await calculateGeoLocation(slug, details, prismaService)
    if (!geoLocation) {
      console.log('Geolocation failed')
      await prismaService.campaign.update({
        where: {
          slug,
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
  slug: string,
  details: PrismaJson.CampaignDetails,
  prismaService: PrismaService,
): Promise<{ lat: number; lng: number; geoHash: string } | null> {
  if (!details?.zip || !details?.state) return null

  const globalCoords = await zipToLatLng(details?.zip, details?.state)
  if (globalCoords == null) return null

  const { lat, lng, geoHash } = globalCoords
  await prismaService.campaign.update({
    where: {
      slug: slug,
    },
    data: {
      details: {
        ...details,
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
