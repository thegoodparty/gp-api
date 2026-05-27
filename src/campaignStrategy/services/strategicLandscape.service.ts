import { Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { z } from 'zod'
import { BraintrustService } from 'src/vendors/braintrust/braintrust.service'
import { GeminiService } from 'src/vendors/google/services/gemini.service'
import {
  ChallengesSchema,
  Opponent,
  OpportunitiesSchema,
  OppositionResearchRaw,
  OppositionResearchRawSchema,
  StrategicLandscapeResult,
} from '../schemas/strategicLandscape.schema'
import { RaceContext } from '../types/electionApi.types'
import { StrategicLandscapePersister } from './strategicLandscape.persister'
import {
  buildPromptVariables,
  CHALLENGES_SEARCH_PROMPT,
  CHALLENGES_STRUCTURED_PROMPT,
  OPPORTUNITIES_SEARCH_PROMPT,
  OPPORTUNITIES_STRUCTURED_PROMPT,
  OPPOSITION_RESEARCH_SEARCH_PROMPT,
  OPPOSITION_RESEARCH_STRUCTURED_PROMPT,
  PromptVariables,
  renderPrompt,
} from './strategicLandscape.prompts'

const SEARCH_SPAN = 'gemini:search'
const STRUCTURED_SPAN = 'gemini:structured'

// Maps the snake_case shape Gemini produces (per the opposition-research
// prompt spec) onto our internal camelCase Opponent type, filling the
// schema's optional fields with safe defaults so the persister always
// sees consistent data.
const normalizeOpponents = (raw: OppositionResearchRaw): Opponent[] =>
  raw.opponents.map((o) => ({
    fullName: o.full_name,
    partyAffiliation: o.party_affiliation,
    incumbent: o.incumbent,
    politicalSummary: o.political_summary ?? '',
    keyFacts: o.key_facts ?? [],
    websites: o.websites ?? [],
  }))

@Injectable()
export class StrategicLandscapeService {
  constructor(
    private readonly gemini: GeminiService,
    private readonly braintrust: BraintrustService,
    private readonly persister: StrategicLandscapePersister,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StrategicLandscapeService.name)
  }

  async generate(
    campaignStrategyId: number,
    campaignId: number,
    ctx: RaceContext,
  ): Promise<StrategicLandscapeResult> {
    const variables = buildPromptVariables(ctx)

    const result = await this.braintrust.tracedNested(
      'strategic-landscape:generate',
      async () => {
        const [opportunities, challenges, opposition] = await Promise.all([
          this.runPipeline(variables, {
            spanName: 'strategic-landscape:opportunities',
            pipelineTag: 'opportunities',
            searchPrompt: OPPORTUNITIES_SEARCH_PROMPT,
            structuredPrompt: OPPORTUNITIES_STRUCTURED_PROMPT,
            schema: OpportunitiesSchema,
          }),
          this.runPipeline(variables, {
            spanName: 'strategic-landscape:challenges',
            pipelineTag: 'challenges',
            searchPrompt: CHALLENGES_SEARCH_PROMPT,
            structuredPrompt: CHALLENGES_STRUCTURED_PROMPT,
            schema: ChallengesSchema,
          }),
          this.runPipeline(variables, {
            spanName: 'strategic-landscape:opposition-research',
            pipelineTag: 'opposition-research',
            searchPrompt: OPPOSITION_RESEARCH_SEARCH_PROMPT,
            structuredPrompt: OPPOSITION_RESEARCH_STRUCTURED_PROMPT,
            schema: OppositionResearchRawSchema,
          }),
        ])

        return {
          opportunities: opportunities.opportunities,
          challenges: challenges.challenges,
          opponents: normalizeOpponents(opposition),
        }
      },
      {
        input: { campaignId, campaignStrategyId },
        metadata: { campaignStrategyId, candidateOffice: ctx.candidateOffice },
        type: 'task',
      },
    )

    await this.persister.persist(campaignStrategyId, result)
    return result
  }

  private runPipeline<T>(
    variables: PromptVariables,
    config: {
      spanName: string
      pipelineTag: string
      searchPrompt: string
      structuredPrompt: string
      schema: z.ZodType<T>
    },
  ): Promise<T> {
    return this.braintrust.tracedNested(
      config.spanName,
      async () => {
        const searchText = await this.runSearchStage(
          config.searchPrompt,
          variables,
        )
        return this.runStructuredStage(
          config.structuredPrompt,
          variables,
          searchText,
          config.schema,
        )
      },
      { type: 'task', metadata: { pipeline: config.pipelineTag } },
    )
  }

  private async runSearchStage(
    promptTemplate: string,
    variables: PromptVariables,
  ): Promise<string> {
    const prompt = renderPrompt(promptTemplate, variables)
    const result = await this.braintrust.tracedNested(
      SEARCH_SPAN,
      () => this.gemini.generateWithSearch(prompt),
      { input: { prompt }, type: 'llm' },
    )
    return result.text
  }

  private runStructuredStage<T>(
    promptTemplate: string,
    variables: PromptVariables,
    searchText: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const prompt = renderPrompt(promptTemplate, {
      ...variables,
      searchResults: searchText,
    })
    return this.braintrust.tracedNested(
      STRUCTURED_SPAN,
      () => this.gemini.generateStructured(prompt, schema),
      { input: { prompt }, type: 'llm' },
    )
  }
}
