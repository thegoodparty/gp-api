import {
  GoogleAddressComponent,
  GoogleAddressPlace,
  GooglePlacesApiResponse,
} from '../../../shared/types/GooglePlaces.types'

export const extractAddressComponent = (
  { address_components }: GooglePlacesApiResponse,
  types: GoogleAddressPlace | GoogleAddressPlace[],
): GoogleAddressComponent | null => {
  const typeArray = Array.isArray(types) ? types : [types]
  return (
    address_components.find((comp) =>
      typeArray.every((type) => comp.types.includes(type)),
    ) || null
  )
}

export const extractStreetAddress = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'street_address')

export const extractRoute = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'route')

export const extractIntersection = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'intersection')

export const extractPolitical = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'political')

export const extractCountry = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'country')

export const extractAdministrativeAreaLevel1 = (
  place: GooglePlacesApiResponse,
) => extractAddressComponent(place, 'administrative_area_level_1')

export const extractAdministrativeAreaLevel2 = (
  place: GooglePlacesApiResponse,
) => extractAddressComponent(place, 'administrative_area_level_2')

export const extractAdministrativeAreaLevel3 = (
  place: GooglePlacesApiResponse,
) => extractAddressComponent(place, 'administrative_area_level_3')

export const extractAdministrativeAreaLevel4 = (
  place: GooglePlacesApiResponse,
) => extractAddressComponent(place, 'administrative_area_level_4')

export const extractAdministrativeAreaLevel5 = (
  place: GooglePlacesApiResponse,
) => extractAddressComponent(place, 'administrative_area_level_5')

export const extractColloquialArea = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'colloquial_area')

export const extractLocality = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'locality')

export const extractSublocality = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'sublocality')

export const extractNeighborhood = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'neighborhood')

export const extractCity = (place: GooglePlacesApiResponse) =>
  // For some cities, the types are different, so we check for both
  extractAddressComponent(place, ['locality', 'political']) ||
  extractAddressComponent(place, ['neighborhood', 'political'])

export const extractCounty = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, ['administrative_area_level_2', 'political'])

export const extractState = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, ['administrative_area_level_1', 'political'])

export const extractPremise = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'premise')

export const extractSubpremise = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'subpremise')

export const extractPostalCode = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'postal_code')

export const extractNaturalFeature = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'natural_feature')

export const extractAirport = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'airport')

export const extractPark = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'park')

export const extractPointOfInterest = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'point_of_interest')

export const extractEstablishment = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'establishment')

export const extractGeocode = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'geocode')

export const extractPostalTown = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'postal_town')

export const extractStreetNumber = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'street_number')

export const extractFloor = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'floor')

export const extractRoom = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'room')

export const extractPostalBox = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'postal_box')

export const extractPostalCodeSuffix = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'postal_code_suffix')

export const extractSublocalityLevel1 = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'sublocality_level_1')

export const extractSublocalityLevel2 = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'sublocality_level_2')

export const extractSublocalityLevel3 = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'sublocality_level_3')

export const extractSublocalityLevel4 = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'sublocality_level_4')

export const extractSublocalityLevel5 = (place: GooglePlacesApiResponse) =>
  extractAddressComponent(place, 'sublocality_level_5')

export const extractStreetLine = (place: GooglePlacesApiResponse) => {
  const streetNumber = extractStreetNumber(place)?.long_name
  const route = extractRoute(place)?.long_name
  return streetNumber && route ? `${streetNumber} ${route}` : route || ''
}

export const extractAddressComponents = (
  place: GooglePlacesApiResponse,
): {
  street: string
  city: GoogleAddressComponent | null
  state: GoogleAddressComponent | null
  postalCode: GoogleAddressComponent | null
  county: GoogleAddressComponent | null
} => ({
  street: extractStreetLine(place),
  city: extractCity(place), // Limit to 100 characters per Peerly API docs
  state: extractState(place),
  county: extractCounty(place),
  postalCode: extractPostalCode(place),
})
