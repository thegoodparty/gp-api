import { Injectable } from '@nestjs/common'
import { CampaignsService } from './campaigns.service'
import * as ngeohash from 'ngeohash'

const googleApiKey = process.env.GOOGLE_API_KEY

interface GeocodeLocation {
  results: Array<{
    geometry: {
      location: {
        lat: number
        lng: number
      }
    }
  }>
  status: string
}

@Injectable()
export class GeocodingService {
  constructor(private readonly campaignsService: CampaignsService) {}

  async handleGeoLocation(
    slug: string,
    details: PrismaJson.CampaignDetails,
    forceReCalc: boolean | undefined,
  ): Promise<{ lat: number; lng: number } | null> {
    const { geoLocationFailed, geoLocation } = details || {}

    if (!forceReCalc && geoLocationFailed) {
      return null
    }

    if (forceReCalc || !geoLocation?.lng) {
      const geoLocation = await this.calculateGeoLocation(slug, details)
      if (!geoLocation) {
        await this.campaignsService.update({
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

  async calculateGeoLocation(
    slug: string,
    details: PrismaJson.CampaignDetails,
  ): Promise<{ lat: number; lng: number; geoHash: string } | null> {
    if (!details?.zip || !details?.state) return null

    const globalCoords = await this.zipToLatLng(details?.zip, details?.state)
    if (globalCoords == null) return null

    const { lat, lng, geoHash } = globalCoords
    await this.campaignsService.update({
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

  async zipToLatLng(
    zip: string,
    state: string,
  ): Promise<{ lat: number; lng: number; geoHash: string } | null> {
    if (!googleApiKey) {
      throw new Error('GOOGLE_API_KEY is not set in the environment variables.')
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&components=administrative_area:${state}|country:US&key=${googleApiKey}`
    const response = await fetch(url)

    if (!response.ok) {
      return null
    } else {
      const data = (await response.json()) as GeocodeLocation
      const location = data?.results[0]?.geometry?.location
      if (!location) {
        return null
      }
      const geoHash = ngeohash.encode(location.lat, location.lng, 8)
      return { lat: location.lat, lng: location.lng, geoHash: geoHash }
    }
  }
}
