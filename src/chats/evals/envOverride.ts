import { config as loadEnv } from 'dotenv'
import path from 'node:path'

// Vitest auto-loads .env.test, which has stub TOGETHER_AI_KEY /
// ANTHROPIC_API_KEY values. Eval tests need the real keys from .env —
// override BEFORE constructing LlmService.
export const overrideEnvForEvals = (): void => {
  loadEnv({
    path: path.resolve(process.cwd(), '.env'),
    override: true,
  })
}
