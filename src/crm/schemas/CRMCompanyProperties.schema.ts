import { z } from 'zod'
import { HubSpot } from '../crm.types'

// local shorthand var
const HS_PROPS = HubSpot.OutgoingProperty

const timestampSchema = z.string().regex(/^\d+$/)
const intSchema = z.number().int().transform(String)
const yesNoSchema = z.union([z.literal('yes'), z.literal('no')])
const upperYesNoSchema = z.union([z.literal('Yes'), z.literal('No')])

export const CRMCompanyPropertiesSchema = z
  .object({
    // voter contact numbers
    [HS_PROPS.calls_made]: intSchema,
    [HS_PROPS.direct_mail_sent]: intSchema,
    [HS_PROPS.event_impressions]: intSchema,
    [HS_PROPS.knocked_doors]: intSchema,
    [HS_PROPS.doors_knocked]: intSchema,
    [HS_PROPS.online_impressions]: intSchema,
    [HS_PROPS.yard_signs_impressions]: intSchema,
    [HS_PROPS.ecanvasser_contacts_count]: intSchema,

    // candidate details
    [HS_PROPS.candidate_district]: z.string(),
    [HS_PROPS.candidate_email]: z.string().email(),
    [HS_PROPS.candidate_name]: z.string(),
    [HS_PROPS.name]: z.string(),
    [HS_PROPS.candidate_office]: z.string(),
    [HS_PROPS.office_level]: z.string(),
    [HS_PROPS.candidate_party]: z.string(),
    [HS_PROPS.candidate_state]: z.string(),
    [HS_PROPS.state]: z.string(),
    [HS_PROPS.city]: z.string(),
    [HS_PROPS.zip]: z.string(),
    [HS_PROPS.created_by_admin]: yesNoSchema,
    [HS_PROPS.admin_user]: z.string().email(),
    [HS_PROPS.pledge_status]: yesNoSchema,
    [HS_PROPS.pro_candidate]: upperYesNoSchema,
    [HS_PROPS.pro_subscription_status]: z.union([
      z.literal('Active'),
      z.literal('Inactive'),
    ]),
    [HS_PROPS.pro_upgrade_date]: timestampSchema,
    [HS_PROPS.running]: yesNoSchema,

    // election details
    [HS_PROPS.br_position_id]: z.string(),
    [HS_PROPS.br_race_id]: z.string(),
    [HS_PROPS.election_date]: timestampSchema,
    [HS_PROPS.filing_deadline]: timestampSchema,
    [HS_PROPS.filing_start]: timestampSchema,
    [HS_PROPS.filing_end]: timestampSchema,
    [HS_PROPS.primary_date]: timestampSchema,

    // usage details
    [HS_PROPS.last_portal_visit]: timestampSchema,
    [HS_PROPS.last_step]: z.string(),
    [HS_PROPS.last_step_date]: timestampSchema,
    [HS_PROPS.campaign_assistant_chats]: intSchema,
    [HS_PROPS.my_content_pieces_created]: intSchema,
    [HS_PROPS.product_sessions]: intSchema,
    [HS_PROPS.voter_files_created]: intSchema,
    [HS_PROPS.voter_data_adoption]: z.union([
      z.literal('Unlocked'),
      z.literal('Locked'),
    ]),

    // p2v details / viability
    [HS_PROPS.automated_score]: z
      .number()
      .int()
      .min(0)
      .max(5)
      .transform(String),
    [HS_PROPS.p2v_status]: z.union([
      z.literal('Complete'),
      z.literal('Waiting'),
      z.literal('Locked'),
      z.literal('Failed'),
    ]),
    [HS_PROPS.totalregisteredvoters]: intSchema,
    [HS_PROPS.votegoal]: intSchema,
    [HS_PROPS.win_number]: intSchema,
  })
  .strict()
  .partial()

export type CRMCompanyProperties = z.infer<typeof CRMCompanyPropertiesSchema>
