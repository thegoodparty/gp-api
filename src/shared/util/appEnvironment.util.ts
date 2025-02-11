enum AppEnv {
  PROD = 'production',
  DEV = 'development',
  QA = 'qa',
  LOCAL = 'local',
}
const CURRENT_ENV = process.env.NODE_ENV

export const WEBAPP_ROOT = process.env.WEBAPP_ROOT_URL as string
export const ASSET_DOMAIN = process.env.ASSET_DOMAIN as string

export const IS_PROD = isEnvironment(AppEnv.PROD)
export const IS_DEV = isEnvironment(AppEnv.DEV)

function isEnvironment(env: AppEnv) {
  return CURRENT_ENV === env
}
