import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentService } from './content.service'

type PromptRow = { id: string; type: string; data: Record<string, unknown> }

const makePrompt = (name: string, systemPrompt: string): PromptRow => ({
  id: `id-${name}`,
  type: 'aiChatPrompt',
  data: {
    name,
    systemPrompt,
    initialPrompt: `initial-${name}`,
    candidateJson: { hello: 'world' },
  },
})

describe('ContentService.getChatSystemPrompt prompt selection', () => {
  let service: ContentService
  let findMany: ReturnType<typeof vi.fn>
  let warn: ReturnType<typeof vi.fn>

  const setRows = (rows: PromptRow[]) => findMany.mockResolvedValue(rows)

  beforeEach(() => {
    findMany = vi.fn()
    warn = vi.fn()
    service = new ContentService(
      {} as unknown as ConstructorParameters<typeof ContentService>[0],
      {} as unknown as ConstructorParameters<typeof ContentService>[1],
    )
    // Inject mocks for the Prisma model getter + logger from the base class.
    ;(service as unknown as { _prisma: unknown })._prisma = { content: { findMany } }
    ;(service as unknown as { logger: unknown }).logger = { warn }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to the "General" entry when CONTENTFUL_CHAT_PROMPT_NAME is unset', async () => {
    vi.stubEnv('CONTENTFUL_CHAT_PROMPT_NAME', '')
    setRows([makePrompt('Dev', 'dev-prompt'), makePrompt('General', 'general-prompt')])

    const { systemPrompt } = await service.getChatSystemPrompt()

    expect(systemPrompt).toBe('general-prompt')
    expect(warn).not.toHaveBeenCalled()
  })

  it('selects the configured entry by name (case-insensitive)', async () => {
    vi.stubEnv('CONTENTFUL_CHAT_PROMPT_NAME', 'dev')
    setRows([makePrompt('Dev', 'dev-prompt'), makePrompt('General', 'general-prompt')])

    const { systemPrompt } = await service.getChatSystemPrompt()

    expect(systemPrompt).toBe('dev-prompt')
    expect(warn).not.toHaveBeenCalled()
  })

  it('returns the initial prompt when initial=true', async () => {
    vi.stubEnv('CONTENTFUL_CHAT_PROMPT_NAME', 'Dev')
    setRows([makePrompt('Dev', 'dev-prompt')])

    const { systemPrompt } = await service.getChatSystemPrompt(true)

    expect(systemPrompt).toBe('initial-Dev')
  })

  it('falls back to "General" and warns when the configured entry is missing', async () => {
    vi.stubEnv('CONTENTFUL_CHAT_PROMPT_NAME', 'Staging')
    setRows([makePrompt('Dev', 'dev-prompt'), makePrompt('General', 'general-prompt')])

    const { systemPrompt } = await service.getChatSystemPrompt()

    expect(systemPrompt).toBe('general-prompt')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('falls back to the first entry when neither configured nor "General" exist', async () => {
    vi.stubEnv('CONTENTFUL_CHAT_PROMPT_NAME', 'Staging')
    setRows([makePrompt('Dev', 'dev-prompt'), makePrompt('Other', 'other-prompt')])

    const { systemPrompt } = await service.getChatSystemPrompt()

    expect(systemPrompt).toBe('dev-prompt')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('injects today into candidateJson and throws when no entries exist', async () => {
    vi.stubEnv('CONTENTFUL_CHAT_PROMPT_NAME', 'General')
    const row = makePrompt('General', 'general-prompt')
    row.data.candidateJson = { date: '${today}' }
    setRows([row])
    const today = new Date().toISOString().split('T')[0]

    const { candidateJson } = await service.getChatSystemPrompt()
    expect(candidateJson).toContain(today)
    expect(candidateJson).not.toContain('${today}')

    setRows([])
    await expect(service.getChatSystemPrompt()).rejects.toThrow(
      'Failed to load system prompt',
    )
  })
})
