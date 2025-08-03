import { Injectable, BadGatewayException } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { GooglePlacesApiResponse } from '../types/GooglePlaces.types'
import { firstValueFrom } from 'rxjs'

const googleApiKey = process.env.GOOGLE_API_KEY

if (!googleApiKey) {
  throw new Error('Please set GOOGLE_API_KEY in your .env')
}

@Injectable()
export class PlacesService {
  constructor(private readonly httpService: HttpService) {}

  async getAddressByPlaceId(placeId: string): Promise<GooglePlacesApiResponse> {
    const url = `https://maps.googleapis.com/maps/api/place/details/json`

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            place_id: placeId,
            key: googleApiKey,
          },
        }),
      )

      if (response.data.status !== 'OK') {
        throw new BadGatewayException(
          `Google Places API error: ${response.data.status}`,
        )
      }

      return response.data.result
    } catch (error) {
      throw new BadGatewayException(
        'Failed to fetch address from Google Places API',
      )
    }
  }
}
