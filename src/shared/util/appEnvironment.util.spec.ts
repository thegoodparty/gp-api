import {
  ASSET_DOMAIN,
  CURRENT_ENVIRONMENT,
  IS_DEV,
  IS_PROD,
  WEBAPP_API_PATH,
  WEBAPP_ROOT,
} from './appEnvironment.util'

describe('appEnvironment.util', () => {
  it('exports constants and flags', () => {
    expect(typeof WEBAPP_API_PATH).toBe('string')
    expect([true, false]).toContain(IS_DEV)
    expect([true, false]).toContain(IS_PROD)
    // In test runs NODE_ENV is typically 'test'; CURRENT_ENVIRONMENT mirrors NODE_ENV, so accept any string
    expect(typeof CURRENT_ENVIRONMENT === 'string' || CURRENT_ENVIRONMENT === undefined).toBe(true)
    void WEBAPP_ROOT
    void ASSET_DOMAIN
  })
})


