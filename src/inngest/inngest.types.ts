import { GetEvents } from 'inngest'
import { inngest } from './inngest.client'

export type InngestEvents = GetEvents<typeof inngest>

export type PollCreationEvent = InngestEvents['polls/creation.requested']
export type PollExpansionEvent = InngestEvents['polls/expansion.requested']
