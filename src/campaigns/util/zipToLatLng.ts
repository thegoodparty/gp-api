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

if (!googleApiKey) {
  throw new Error('GOOGLE_API_KEY is not set in the environment variables.')
}

export async function zipToLatLng(
  zip: string,
  state: string,
): Promise<{ lat: number; lng: number; geoHash: string } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&components=administrative_area:${state}|country:US&key=${googleApiKey}`
  const response = await fetch(url)

  if (!response.ok) {
    return null
  } else {
    const data = (await response.json()) as GeocodeLocation
    const location = data?.results[0]?.geometry?.location
    if (!location) {
      console.log('Response: ', data)
      return null
    }
    const geoHash = ngeohash.encode(location.lat, location.lng, 8)
    return { lat: location.lat, lng: location.lng, geoHash: geoHash }
  }
}
