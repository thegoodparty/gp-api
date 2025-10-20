export const P2P_JOB_DEFAULTS = {
  CAMPAIGN_NAME: 'P2P SMS Campaign',
  DID_STATE: 'USA',
  TEMPLATE_TITLE: 'Default Template',
} as const

export const P2P_ERROR_MESSAGES = {
  IMAGE_REQUIRED: 'Image file is required for P2P job creation',
  INVALID_IMAGE_PROPERTIES: 'Invalid image file: missing required properties',
  JOB_CREATION_FAILED: 'Failed to create P2P job',
  RETRIEVE_JOB_FAILED: 'Failed to fetch P2P job',
  RETRIEVE_JOBS_FAILED: 'Failed to fetch P2P jobs',
} as const

export const P2P_PHONE_LIST_MAP = {
  first_name: 1,
  last_name: 2,
  lead_phone: 3,
  state: 4,
  city: 5,
  zip: 6,
} as const
