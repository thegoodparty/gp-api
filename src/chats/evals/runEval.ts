import { expect } from 'vitest'

export interface EvalCase {
  name: string
  userMessage: string
  mustContain?: (string | RegExp)[]
  mustNotContain?: (string | RegExp)[]
  custom?: (response: string) => void
}

const matches = (response: string, m: string | RegExp): boolean =>
  typeof m === 'string'
    ? response.toLowerCase().includes(m.toLowerCase())
    : m.test(response)

export const assertEvalCase = (response: string, c: EvalCase): void => {
  for (const m of c.mustContain ?? []) {
    expect(
      matches(response, m),
      `[${c.name}] expected response to contain ${String(m)}, ` +
        `got: "${response.slice(0, 400)}"`,
    ).toBe(true)
  }
  for (const m of c.mustNotContain ?? []) {
    expect(
      matches(response, m),
      `[${c.name}] expected response NOT to contain ${String(m)}, ` +
        `got: "${response.slice(0, 400)}"`,
    ).toBe(false)
  }
  if (c.custom) c.custom(response)
  expect(response.length).toBeGreaterThan(0)
}
