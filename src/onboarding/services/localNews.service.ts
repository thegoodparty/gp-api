import { Injectable } from '@nestjs/common'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { PinoLogger } from 'nestjs-pino'
import crypto from 'node:crypto'
import { Campaign } from '@prisma/client'
import { AiService } from '@/ai/ai.service'
import type { AiChatMessage } from '@/campaigns/ai/chat/aiChat.types'
import { CampaignsService } from '@/campaigns/services/campaigns.service'
import {
  aiOutletsToolResultSchema,
  LocalNewsOutlet,
  LocalNewsResponse,
} from '../schemas/getLocalNews.schema'

const SYSTEM_PROMPT = `You are a local media research assistant helping political candidates identify news outlets to monitor during their campaign.

Given a candidate's race location, return up to 10 local news outlets the candidate should monitor for coverage of local issues and their race.

REQUIREMENTS:
1. Each outlet must primarily serve the local jurisdiction specified. Do NOT include national outlets (NYT, CNN, Fox, NPR national, AP, Reuters, etc.) or outlets whose coverage area is significantly broader than the race jurisdiction.
2. Prioritize outlets known for straight news reporting over opinion or advocacy outlets. Avoid outlets with a clear partisan lean (left or right).
3. Format diversity is required. Across the full result list, return between 3 and 4 outlets PER format from {TV, print, radio} whenever that many qualifying outlets exist locally. Never return more than 4 of any single format. If a format has fewer than 3 qualifying outlets locally, return as many as exist for that format and do not pad with low-quality outlets.
4. Prefer outlets that actively cover local government, elections, and civic affairs.
5. Order the outlets within each format from most to least relevant for the candidate to monitor.

CONTACT INFO:
For each outlet, return its newsroom email, newsroom/main phone number, and street address WHEN you are highly confident the value is correct.
- If you are not certain a contact value is correct, return null for that field. Never guess.
- Never fabricate contact information. Plausible-sounding but unverified contact info is worse than no contact info.
- Prefer general newsroom or tip-line contacts over individual reporters.

Return at most 10 outlets total. Return at least 1 outlet. Do not fabricate outlets.

Return the result by calling the \`returnLocalNewsOutlets\` tool with arguments matching this exact shape:

\`\`\`
{
  "outlets": [
    {
      "name": "string, the outlet's commonly known name",
      "type": "TV" | "print" | "radio",
      "description": "string, ONE concise sentence (maximum 20 words) identifying the outlet's coverage area and focus. No compound sentences, no semicolons, no lists.",
      "email": "string or null — newsroom email if highly confident, else null",
      "phone": "string or null — newsroom/main phone if highly confident, else null",
      "address": "string or null — street address if highly confident, else null"
    }
  ]
}
\`\`\``

const tool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'returnLocalNewsOutlets',
    description:
      'Return the list of local news outlets a candidate should monitor.',
    parameters: {
      type: 'object',
      properties: {
        outlets: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: {
            type: 'object',
            required: [
              'name',
              'type',
              'description',
              'email',
              'phone',
              'address',
            ],
            properties: {
              name: {
                type: 'string',
                description: "The outlet's commonly known name.",
              },
              type: {
                type: 'string',
                enum: ['TV', 'print', 'radio'],
              },
              description: {
                type: 'string',
                description:
                  "ONE concise sentence (maximum 20 words) identifying the outlet's coverage area and focus. No compound sentences, no semicolons, no lists.",
              },
              email: {
                type: ['string', 'null'],
                description:
                  'Newsroom email when highly confident. Use null when unknown or unsure. Never guess.',
              },
              phone: {
                type: ['string', 'null'],
                description:
                  'Newsroom or main phone number when highly confident. Use null when unknown or unsure. Never guess.',
              },
              address: {
                type: ['string', 'null'],
                description:
                  'Street address when highly confident. Use null when unknown or unsure. Never guess.',
              },
            },
          },
        },
      },
      required: ['outlets'],
    },
  },
}

// If a pending job hasn't resolved within this window, treat it as dead and
// allow the next caller to kick off a fresh fetch. Covers process restarts
// and AI hangs.
const PENDING_TTL_MS = 5 * 60 * 1000

@Injectable()
export class OnboardingLocalNewsService {
  constructor(
    private readonly ai: AiService,
    private readonly campaigns: CampaignsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OnboardingLocalNewsService.name)
  }

  async getLocalNews({
    city,
    state,
    office,
    campaign,
  }: {
    city?: string
    state: string
    office: string
    campaign: Campaign
  }): Promise<LocalNewsResponse> {
    const cityKey = city ?? null
    const existing = campaign.data?.onboarding?.localMediaOutlets
    const matchesKey =
      existing?.office === office &&
      existing?.city === cityKey &&
      existing?.state === state

    if (existing && matchesKey) {
      if (existing.status === 'ready') {
        this.logger.info(
          {
            office,
            city: cityKey,
            state,
            outletCount: existing.outlets.length,
            campaignId: campaign.id,
          },
          'getLocalNews cache hit',
        )
        return { status: 'ready', outlets: existing.outlets }
      }
      if (
        existing.status === 'pending' &&
        Date.now() - existing.startedAt < PENDING_TTL_MS
      ) {
        return { status: 'pending' }
      }
    }

    const claimed = await this.markPending(campaign.id, {
      office,
      city: cityKey,
      state,
    })
    if (claimed) {
      void this.runFetch({ campaignId: campaign.id, city, state, office })
    }
    return { status: 'pending' }
  }

  private async runFetch({
    campaignId,
    city,
    state,
    office,
  }: {
    campaignId: number
    city?: string
    state: string
    office: string
  }): Promise<void> {
    const jurisdiction = city ? `${city}, ${state}` : state
    const startedAt = Date.now()
    this.logger.info(
      { jurisdiction, office, campaignId },
      'getLocalNews background fetch started',
    )

    try {
      const messages: AiChatMessage[] = [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        },
        {
          role: 'user',
          content: `Jurisdiction: ${jurisdiction}\nOffice: ${office}`,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        },
      ]

      const completion = await this.ai.getChatToolCompletion({
        messages,
        tool,
        toolChoice: {
          type: 'function',
          function: { name: 'returnLocalNewsOutlets' },
        },
        temperature: 0.2,
        topP: 0.1,
        models: ['deepseek-ai/DeepSeek-V4-Pro'],
        enableReasoning: true,
        maxTokens: 8000,
      })

      const raw = completion.content?.trim()
      if (!raw) {
        throw new Error('AI returned no content for local news outlets')
      }

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(raw)
      } catch (error) {
        throw new Error(`Failed to JSON.parse local news AI response: ${error}`)
      }

      const validated = aiOutletsToolResultSchema.safeParse(parsedJson)
      if (!validated.success) {
        this.logger.error(
          {
            issues: validated.error.issues,
            parsed: parsedJson,
            campaignId,
            office,
          },
          'AI local news response failed schema validation',
        )
        throw new Error('AI returned unexpected outlet shape')
      }

      await this.writeReady(
        campaignId,
        { office, city: city ?? null, state },
        validated.data.outlets,
      )
      this.logger.info(
        {
          jurisdiction,
          office,
          campaignId,
          outletCount: validated.data.outlets.length,
          elapsedMs: Date.now() - startedAt,
        },
        'getLocalNews background fetch completed',
      )
    } catch (error) {
      this.logger.error(
        { error, campaignId, office, elapsedMs: Date.now() - startedAt },
        'getLocalNews background fetch failed',
      )
      await this.expirePending(campaignId, {
        office,
        city: city ?? null,
        state,
      })
    }
  }

  // Atomically attempt to claim the slot for the (campaign, jurisdiction)
  // key. Re-reads the campaign inside the same call so a concurrent request
  // can't both see "no pending marker" and both kick off an AI run. Returns
  // true if this caller claimed the slot and should run the AI fetch; false
  // if another caller already owns a fresh pending marker for the SAME
  // (office, city, state) jurisdiction.
  //
  // Note: this is "good enough" for the single-user onboarding case (the only
  // realistic concurrency is React Strict Mode double-mounts or multi-tab).
  // True transactional safety would need a serializable tx + conditional
  // update; the cost-benefit doesn't justify it here.
  private async markPending(
    campaignId: number,
    key: { office: string; city: string | null; state: string },
  ): Promise<boolean> {
    const fresh = await this.campaigns.findFirst({ where: { id: campaignId } })
    const current = fresh?.data?.onboarding?.localMediaOutlets
    if (
      current?.office === key.office &&
      current.city === key.city &&
      current.state === key.state &&
      current.status === 'pending' &&
      Date.now() - current.startedAt < PENDING_TTL_MS
    ) {
      return false
    }
    await this.writeLocalMediaOutlets(campaignId, {
      ...key,
      status: 'pending',
      startedAt: Date.now(),
    })
    return true
  }

  private async writeReady(
    campaignId: number,
    key: { office: string; city: string | null; state: string },
    outlets: LocalNewsOutlet[],
  ): Promise<void> {
    await this.writeLocalMediaOutlets(campaignId, {
      ...key,
      status: 'ready',
      outlets,
    })
  }

  private async expirePending(
    campaignId: number,
    key: { office: string; city: string | null; state: string },
  ): Promise<void> {
    try {
      const fresh = await this.campaigns.findFirst({
        where: { id: campaignId },
      })
      const current = fresh?.data?.onboarding?.localMediaOutlets
      // Only invalidate if the pending marker still belongs to this exact
      // jurisdiction. A newer caller may have overwritten it with a different
      // (office, city, state) (or a successful ready result) and we don't
      // want to clobber that.
      if (
        !current ||
        current.office !== key.office ||
        current.city !== key.city ||
        current.state !== key.state ||
        current.status !== 'pending'
      ) {
        return
      }
      // Set startedAt to 0 so the TTL check immediately treats this as
      // expired. The next poll will trigger a fresh fetch instead of waiting
      // out the full TTL window.
      await this.writeLocalMediaOutlets(campaignId, {
        ...key,
        status: 'pending',
        startedAt: 0,
      })
    } catch (error) {
      this.logger.error(
        { error, campaignId, ...key },
        'Failed to expire pending localMediaOutlets marker',
      )
    }
  }

  // Replace data.onboarding.localMediaOutlets wholesale. We bypass
  // CampaignsService.updateJsonFields here because its deepMerge concatenates
  // arrays and preserves keys not in the source — both bugs for this slot:
  //
  // - writeReady -> deepMerge concats the new `outlets` array onto the
  //   previous run's array, growing the list unboundedly across cache misses.
  // - markPending -> deepMerge keeps the stale `outlets` from a prior ready
  //   write under the pending object, so the next ready write deepMerges
  //   into it and concats again.
  //
  // Doing a direct read + replace + update on the campaign row sidesteps
  // both. Other onboarding fields (structuredOffice, ballotStatus, etc.)
  // are preserved by spreading the existing data through.
  private async writeLocalMediaOutlets(
    campaignId: number,
    next: PrismaJson.LocalMediaOutletsCache,
  ): Promise<void> {
    const fresh = await this.campaigns.findFirst({ where: { id: campaignId } })
    if (!fresh) return
    const nextData: PrismaJson.CampaignData = {
      ...(fresh.data ?? {}),
      onboarding: {
        ...(fresh.data?.onboarding ?? {}),
        localMediaOutlets: next,
      },
    }
    await this.campaigns.model.update({
      where: { id: campaignId },
      data: { data: nextData },
    })
  }
}
