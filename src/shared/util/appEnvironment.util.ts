enum AppEnv {
  PROD = 'production',
  DEV = 'development',
  QA = 'qa',
  LOCAL = 'local',
}
const CURRENT_ENV = process.env.NODE_ENV

export const APP_ROOT =
  process.env.APP_ROOT_URL || ('https://app.goodparty.org' as const)
export const WEBAPP_ROOT = process.env.WEBAPP_ROOT_URL as string // marketing site
export const ASSET_DOMAIN = process.env.ASSET_DOMAIN as string
export const WEBAPP_API_PATH = '/api/v1/'

export const IS_PROD = isEnvironment(AppEnv.PROD)
export const IS_DEV = isEnvironment(AppEnv.DEV)

function isEnvironment(env: AppEnv) {
  return CURRENT_ENV === env
}

export const CURRENT_ENVIRONMENT = CURRENT_ENV as AppEnv
