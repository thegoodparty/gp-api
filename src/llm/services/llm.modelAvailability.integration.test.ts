/**
 * Integration test that verifies all configured AI model identifiers
 * are still available on Together AI's serverless API.
 *
 * Skipped by default — set TOGETHER_AI_INTEGRATION_TEST=true and provide
 * a real TOGETHER_AI_KEY to run (e.g. in a nightly or pre-deploy CI job).
 */
import { describe, expect, it } from 'vitest'
import { POLL_BIAS_MODELS } from 'src/polls/types/pollBias.types'

const TOGETHER_AI_KEY = process.env.TOGETHER_AI_KEY
const AI_MODELS = process.env.AI_MODELS

let cachedModelIds: string[] | undefined

async function getAvailableModels(): Promise<string[]> {
  if (cachedModelIds) return cachedModelIds

  const res = await fetch('https://api.together.xyz/v1/models', {
    headers: { Authorization: `Bearer ${TOGETHER_AI_KEY}` },
  })
  if (!res.ok) {
    throw new Error(`Together AI /v1/models returned ${res.status}`)
  }
  const body = (await res.json()) as { data: { id: string }[] }
  cachedModelIds = body.data.map((m) => m.id)
  return cachedModelIds
}

describe.runIf(process.env.TOGETHER_AI_INTEGRATION_TEST)(
  'Model availability on Together AI',
  () => {
    it('all AI_MODELS env var models are available', async () => {
      if (!AI_MODELS) return

      const availableModelIds = await getAvailableModels()
      const configured = AI_MODELS.split(',')
        .map((m) => m.trim())
        .filter((m) => m.length > 0)

      for (const model of configured) {
        expect(
          availableModelIds,
          `Model "${model}" from AI_MODELS is no longer available on Together AI`,
        ).toContain(model)
      }
    })

    it('all POLL_BIAS_MODELS are available', async () => {
      const availableModelIds = await getAvailableModels()

      for (const model of POLL_BIAS_MODELS) {
        expect(
          availableModelIds,
          `Model "${model}" from POLL_BIAS_MODELS is no longer available on Together AI`,
        ).toContain(model)
      }
    })
  },
)
