enum AppEnv {
  PROD = 'production',
  DEV = 'development',
  QA = 'qa',
  LOCAL = 'local',
}
const CURRENT_ENV = process.env.NODE_ENV

export const WEBAPP_ROOT = process.env.WEBAPP_ROOT_URL as string

export const IS_PROD = isEnvironment(AppEnv.PROD)

function isEnvironment(env: AppEnv) {
  return CURRENT_ENV === env
}
