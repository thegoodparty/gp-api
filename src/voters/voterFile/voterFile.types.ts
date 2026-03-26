import { CampaignTaskType } from 'src/campaigns/tasks/campaignTasks.types'

export enum VoterFileType {
  full = 'full',
  doorKnocking = 'doorKnocking',
  sms = 'sms',
  digitalAds = 'digitalAds',
  directMail = 'directMail',
  telemarketing = 'telemarketing',
  custom = 'custom',
  robocall = CampaignTaskType.robocall,
}

// TODO: these should be cleaned up to only be what is currently used
// Import from shared location to avoid circular dependencies
import {
  CUSTOM_CHANNELS,
  CUSTOM_FILTERS,
  CUSTOM_PURPOSES,
  CustomChannel,
  CustomFilter,
  CustomPurpose,
} from '../../shared/types/voter.types'

// Re-export for backward compatibility
export {
  CUSTOM_CHANNELS,
  CUSTOM_FILTERS,
  CUSTOM_PURPOSES,
  CustomChannel,
  CustomFilter,
  CustomPurpose,
}

export const CHANNEL_TO_TYPE_MAP: {
  [key in CustomChannel]: VoterFileType
} = {
  'Door Knocking': VoterFileType.doorKnocking,
  'SMS Texting': VoterFileType.sms,
  Texting: VoterFileType.sms,
  'Direct Mail': VoterFileType.directMail,
  Telemarketing: VoterFileType.telemarketing,
  'Phone Banking': VoterFileType.telemarketing,
  Facebook: VoterFileType.digitalAds,
}

export const TASK_TO_TYPE_MAP: {
  [key in CampaignTaskType]: VoterFileType
} = {
  [CampaignTaskType.doorKnocking]: VoterFileType.doorKnocking,
  [CampaignTaskType.phoneBanking]: VoterFileType.telemarketing,
  [CampaignTaskType.socialMedia]: VoterFileType.full, // TODO: check if voter file type is correct, should it be digitalAds?
  [CampaignTaskType.robocall]: VoterFileType.robocall,
  [CampaignTaskType.text]: VoterFileType.sms,
  // These maybe won't be used?, putting here for completeness
  [CampaignTaskType.events]: VoterFileType.full,
  [CampaignTaskType.education]: VoterFileType.full,
  [CampaignTaskType.compliance]: VoterFileType.full,
}

// TODO: store this in DB table? (currently in campaign.data)
export type CustomVoterFile = {
  name: string
  channel?: CustomChannel
  purpose?: CustomPurpose
  filters: CustomFilter[]
  createdAt: string
}
