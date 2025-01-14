enum AppEnv {
  PROD,
  DEV,
  QA,
}

const ENV_DOMAINS = {
  [AppEnv.PROD]: 'https://goodparty.org',
  [AppEnv.DEV]: 'https://dev.goodparty.org',
  [AppEnv.QA]: 'https://qa.goodparty.org',
} as const

export const APP_BASE = process.env.CORS_ORIGIN as string

export function isProd() {
  return isEnvironment(AppEnv.PROD)
}

function isEnvironment(env: AppEnv) {
  return APP_BASE === ENV_DOMAINS[env]
}
