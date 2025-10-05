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

console.log('New Relic Configuration Check:', {
  NODE_ENV: process.env.NODE_ENV,
  HAS_APP_NAME: !!process.env.NEW_RELIC_APP_NAME,
  HAS_LICENSE_KEY: !!process.env.NEW_RELIC_LICENSE_KEY,
  APP_NAME: process.env.NEW_RELIC_APP_NAME || 'NOT SET',
})

if (!process.env.NEW_RELIC_APP_NAME || !process.env.NEW_RELIC_LICENSE_KEY) {
  console.error(
    '❌ New Relic DISABLED: Missing required environment variables',
    {
      NEW_RELIC_APP_NAME: process.env.NEW_RELIC_APP_NAME || 'MISSING',
      NEW_RELIC_LICENSE_KEY: process.env.NEW_RELIC_LICENSE_KEY
        ? 'SET'
        : 'MISSING',
    },
  )
  module.exports = {}
} else {
  console.log(`✅ New Relic ENABLED for: ${process.env.NEW_RELIC_APP_NAME}`)

  exports.config = {
    app_name: [process.env.NEW_RELIC_APP_NAME],
    license_key: process.env.NEW_RELIC_LICENSE_KEY,
    logging: {
      level: 'trace',
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

  console.log(
    'New Relic agent initialized. Note: It may take 1-2 minutes for data to appear in New Relic after the first transaction.',
  )

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const newrelic = require('newrelic')

  setTimeout(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const config = newrelic.agent.config
      console.log('New Relic Agent Status:', {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        enabled: config.agent_enabled,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        host: config.host || 'collector.newrelic.com',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        port: config.port || 443,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        appName: config.app_name,
      })
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    } catch (error) {
      console.error('Error checking New Relic agent status:', error.message)
    }
  }, 5000)
}
