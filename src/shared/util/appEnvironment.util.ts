import { requireEnv, getEnv } from 'src/shared/util/env.util'

enum AppEnv {
  PROD = 'production',
  DEV = 'development',
  QA = 'qa',
  LOCAL = 'local',
}
const CURRENT_ENV = process.env.NODE_ENV

export const APP_ROOT =
  getEnv('APP_ROOT_URL') || ('https://app.goodparty.org' as const)
export const WEBAPP_ROOT = requireEnv('WEBAPP_ROOT_URL') // marketing site
export const ASSET_DOMAIN = requireEnv('ASSET_DOMAIN')
export const WEBAPP_API_PATH = '/api/v1/'

export const IS_PROD = isEnvironment(AppEnv.PROD)
export const IS_DEV = isEnvironment(AppEnv.DEV)

function isEnvironment(env: AppEnv) {
  return CURRENT_ENV === env
}

// NODE_ENV is string | undefined — cannot constrain to AppEnv union without runtime check
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
export const CURRENT_ENVIRONMENT = CURRENT_ENV as AppEnv
