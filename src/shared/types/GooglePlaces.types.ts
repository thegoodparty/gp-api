export const GOOGLE_ADDRESS_PLACE_VALUES = [
  'street_address',
  'route',
  'intersection',
  'political',
  'country',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_5',
  'colloquial_area',
  'locality',
  'sublocality',
  'neighborhood',
  'premise',
  'subpremise',
  'postal_code',
  'natural_feature',
  'airport',
  'park',
  'point_of_interest',
  'establishment',
  'geocode',
  'postal_town',
  'street_number',
  'floor',
  'room',
  'postal_box',
  'postal_code_suffix',
  'sublocality_level_1',
  'sublocality_level_2',
  'sublocality_level_3',
  'sublocality_level_4',
  'sublocality_level_5',
] as const

export type GoogleAddressPlace = (typeof GOOGLE_ADDRESS_PLACE_VALUES)[number]

export interface GoogleAddressComponent {
  long_name: string
  short_name: string
  types: GoogleAddressPlace[]
}

export interface GooglePlaceGeometry {
  location?: {
    lat: number
    lng: number
  }
  viewport?: {
    south?: number
    west?: number
    north?: number
    east?: number
  }
}

export interface GooglePlusCode {
  compound_code: string
  global_code: string
}

export interface GooglePlacesApiResponse {
  address_components: GoogleAddressComponent[]
  adr_address: string
  formatted_address: string
  geometry?: GooglePlaceGeometry
  icon?: string
  icon_background_color?: string
  icon_mask_base_uri?: string
  name: string
  place_id: string
  plus_code?: GooglePlusCode
  reference?: string
  types: GoogleAddressPlace[]
  url?: string
  utc_offset?: number | string
  vicinity?: string
  html_attributions?: string[]
  utc_offset_minutes?: number | string
}
