import { Injectable } from '@nestjs/common'
import { parseISO, isValid, isAfter, isBefore } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { BraintrustService } from 'src/vendors/braintrust/braintrust.service'
import { GEMINI_MODEL } from 'src/vendors/google/gemini.types'
import { GeminiService } from 'src/vendors/google/services/gemini.service'
import { CommunityEvent, CommunityEventsResult } from '@goodparty_org/contracts'
import {
  CommunityEventsRaw,
  CommunityEventsRawSchema,
} from '../schemas/communityEvents.schema'
import { CommunityEventsPersister } from './communityEvents.persister'
import {
  buildEventsPromptVariables,
  CommunityEventsPromptContext,
  CommunityEventsPromptVariables,
  EVENTS_FILTER_PROMPT,
  EVENTS_SEARCH_PROMPT,
  renderPrompt,
} from './communityEvents.prompts'

const SEARCH_SPAN = 'gemini:search'
const STRUCTURED_SPAN = 'gemini:structured'

// Model pinned to Gemini 3.5 Flash (stable) for this pipeline. Overrides
// the GeminiService default (3 Flash preview) so we don't ride preview-
// channel behavior shifts in production.
const EVENTS_MODEL = GEMINI_MODEL.FLASH_3_5

// ClickUp § 7 renders exactly 3 events. The schema caps the array at 3,
// the prompt asks for 3, and this constant gates the slice if the model
// returns more anyway — defense in depth.
const MAX_EVENTS = 3

@Injectable()
export class CommunityEventsService {
  constructor(
    private readonly gemini: GeminiService,
    private readonly braintrust: BraintrustService,
    private readonly persister: CommunityEventsPersister,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CommunityEventsService.name)
  }

  async generate(
    campaignStrategyId: number,
    campaignId: number,
    ctx: CommunityEventsPromptContext,
  ): Promise<CommunityEventsResult> {
    const variables = buildEventsPromptVariables(ctx)

    const result = await this.braintrust.tracedNested(
      'community-events:generate',
      async () => {
        const searchText = await this.runSearchStage(variables)
        const raw = await this.runStructuredStage(variables, searchText)
        return this.windowAndClamp(raw, ctx)
      },
      {
        input: { campaignId, campaignStrategyId, variables },
        metadata: {
          campaignStrategyId,
          city: variables.city,
          state: variables.state,
        },
        type: 'task',
      },
    )

    await this.persister.persist(campaignStrategyId, result)
    return result
  }

  private async runSearchStage(
    variables: CommunityEventsPromptVariables,
  ): Promise<string> {
    const prompt = renderPrompt(EVENTS_SEARCH_PROMPT, variables)
    const result = await this.braintrust.tracedNested(
      SEARCH_SPAN,
      () => this.gemini.generateWithSearch(prompt, { model: EVENTS_MODEL }),
      { input: { prompt }, type: 'llm' },
    )
    return result.text
  }

  private async runStructuredStage(
    variables: CommunityEventsPromptVariables,
    searchText: string,
  ): Promise<CommunityEventsRaw> {
    const prompt = renderPrompt(EVENTS_FILTER_PROMPT, {
      ...variables,
      searchResults: searchText,
    })
    return this.braintrust.tracedNested(
      STRUCTURED_SPAN,
      () =>
        this.gemini.generateStructured(prompt, CommunityEventsRawSchema, {
          model: EVENTS_MODEL,
        }),
      { input: { prompt }, type: 'llm' },
    )
  }

  // Drop events whose `date` doesn't parse or falls outside [today,
  // electionDate], then cap at MAX_EVENTS. Mirrors the Python
  // event_generator.py windowing — keeps obviously-bad rows out of the
  // persisted result so the UI doesn't render a past date or a date in
  // the wrong cycle.
  private windowAndClamp(
    raw: CommunityEventsRaw,
    ctx: CommunityEventsPromptContext,
  ): CommunityEventsResult {
    const today = parseISO(ctx.today)
    const electionDate = parseISO(ctx.electionDate)

    const filtered: CommunityEvent[] = []
    for (const event of raw.events) {
      const parsed = parseISO(event.date)
      if (!isValid(parsed)) {
        this.logger.warn(
          { date: event.date, title: event.title },
          'Dropping community event with unparseable date',
        )
        continue
      }
      if (isBefore(parsed, today) || isAfter(parsed, electionDate)) {
        this.logger.debug(
          { date: event.date, title: event.title },
          'Dropping community event outside [today, electionDate]',
        )
        continue
      }
      filtered.push({
        title: event.title,
        description: event.description,
        date: event.date,
        address: event.address ?? null,
        url: event.url ?? null,
      })
      if (filtered.length === MAX_EVENTS) break
    }
    return { events: filtered }
  }
}
