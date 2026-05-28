import { describe, expect, it } from 'vitest'
import {
  buildDistrictTopicsTool,
  DISTRICT_TOPICS_CATALOG,
} from './districtTopics.tool'

describe('DISTRICT_TOPICS_CATALOG', () => {
  it('exposes a non-empty set of curated topics', () => {
    const topics = Object.keys(DISTRICT_TOPICS_CATALOG)
    expect(topics.length).toBeGreaterThanOrEqual(10)
  })

  it('every topic has at least 3 columns and a description', () => {
    for (const [name, topic] of Object.entries(DISTRICT_TOPICS_CATALOG)) {
      expect(topic.description.length).toBeGreaterThan(10)
      expect(
        topic.columns.length,
        `topic ${name} has too few columns`,
      ).toBeGreaterThanOrEqual(3)
      for (const col of topic.columns) {
        expect(col.name).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
        expect(col.meaning.length).toBeGreaterThan(5)
      }
    }
  })

  it('includes the key topics an elected official asks about', () => {
    const topics = Object.keys(DISTRICT_TOPICS_CATALOG)
    expect(topics).toContain('housing')
    expect(topics).toContain('education')
    expect(topics).toContain('healthcare')
    expect(topics).toContain('taxes')
    expect(topics).toContain('turnout_propensity')
  })

  it('housing topic contains the affordable_housing scored columns', () => {
    const housing = DISTRICT_TOPICS_CATALOG.housing
    expect(housing).toBeDefined()
    const colNames = housing!.columns.map((c) => c.name)
    expect(colNames).toContain('hs_affordable_housing_gov_has_role')
    expect(colNames).toContain('hs_affordable_housing_gov_no_role')
  })
})

describe('buildDistrictTopicsTool', () => {
  it('exposes a description that mentions the discovery purpose', () => {
    const tool = buildDistrictTopicsTool()
    expect(tool.description.toLowerCase()).toMatch(
      /(discover|catalog|topics|find columns|list)/,
    )
    expect(typeof tool.inputSchema.parse).toBe('function')
  })

  it('input schema accepts an optional topic filter', () => {
    const tool = buildDistrictTopicsTool()
    expect(() => tool.inputSchema.parse({})).not.toThrow()
    expect(() => tool.inputSchema.parse({ topic: 'housing' })).not.toThrow()
  })

  it('returns the full catalog when called with no topic', async () => {
    const tool = buildDistrictTopicsTool()
    const result = await tool.execute({})
    expect(result.topics.length).toBe(
      Object.keys(DISTRICT_TOPICS_CATALOG).length,
    )
    const housing = result.topics.find((t) => t.name === 'housing')
    expect(housing).toBeDefined()
    expect(housing!.columns.length).toBeGreaterThanOrEqual(3)
  })

  it('filters to a single topic when topic argument is provided', async () => {
    const tool = buildDistrictTopicsTool()
    const result = await tool.execute({ topic: 'housing' })
    expect(result.topics).toHaveLength(1)
    expect(result.topics[0]!.name).toBe('housing')
  })

  it('topic filter is case-insensitive', async () => {
    const tool = buildDistrictTopicsTool()
    const result = await tool.execute({ topic: 'HOUSING' })
    expect(result.topics).toHaveLength(1)
    expect(result.topics[0]!.name).toBe('housing')
  })

  it('returns suggestions when topic does not match (empty topics + nearestMatches)', async () => {
    const tool = buildDistrictTopicsTool()
    const result = await tool.execute({ topic: 'nonexistent-zzz' })
    expect(result.topics).toEqual([])
    expect(result.availableTopics.length).toBeGreaterThan(0)
    // availableTopics should include 'housing', 'education', etc.
    expect(result.availableTopics).toContain('housing')
  })

  it('always echoes the full list of available topic names so the LLM can re-try', async () => {
    const tool = buildDistrictTopicsTool()
    const all = await tool.execute({})
    expect(all.availableTopics).toEqual(
      expect.arrayContaining(Object.keys(DISTRICT_TOPICS_CATALOG)),
    )
  })
})
