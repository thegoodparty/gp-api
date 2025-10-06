'use strict'

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config()
  } catch (error) {
    console.warn(
      'Warning: Failed to load .env file in development environment. Ensure dotenv is installed or environment variables are set directly.',
    )
  }
}

if (!process.env.NEW_RELIC_APP_NAME || !process.env.NEW_RELIC_LICENSE_KEY) {
  console.warn(
    'New Relic disabled: Missing NEW_RELIC_APP_NAME or NEW_RELIC_LICENSE_KEY',
  )
  // Export config with agent_enabled: false to disable the agent
  exports.config = {
    agent_enabled: false,
  }
} else {
  // Export full configuration when env vars are present
  exports.config = {
    agent_enabled: true,
    app_name: [process.env.NEW_RELIC_APP_NAME],
    license_key: process.env.NEW_RELIC_LICENSE_KEY,
    logging: {
      level: 'warn',
      filepath: 'stdout',
    },
    distributed_tracing: {
      enabled: true,
    },
    application_logging: {
      enabled: true,
      forwarding: {
        enabled: true,
      },
      metrics: {
        enabled: true,
      },
      local_decorating: {
        enabled: true,
      },
    },
    allow_all_headers: true,
    attributes: {
      exclude: [
        'request.headers.cookie',
        'request.headers.authorization',
        'request.headers.proxyAuthorization',
        'request.headers.setCookie*',
        'request.headers.x*',
        'response.headers.cookie',
        'response.headers.authorization',
        'response.headers.proxyAuthorization',
        'response.headers.setCookie*',
        'response.headers.x*',
      ],
    },
  }
}
