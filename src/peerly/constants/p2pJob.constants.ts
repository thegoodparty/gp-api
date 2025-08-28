export const P2P_JOB_DEFAULTS = {
  CAMPAIGN_NAME: 'P2P SMS Campaign',
  DID_STATE: 'USA',
  TEMPLATE_TITLE: 'Default Template',
  CANVASSER_INITIALS: 'GE',
  SCHEDULE_ID: 1058113, // Updated schedule_id from testing summary
} as const

export const P2P_ERROR_MESSAGES = {
  IMAGE_REQUIRED: 'Image file is required for P2P job creation',
  INVALID_IMAGE_PROPERTIES: 'Invalid image file: missing required properties',
  JOB_CREATION_FAILED: 'Failed to create P2P job',
} as const
