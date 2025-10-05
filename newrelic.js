'use strict'

// Only load dotenv in non-production environments (local development)
// In production (Docker/ECS), environment variables are passed directly to the container
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

// Debug: Log what we have (without exposing the actual license key)
console.log('New Relic Configuration Check:', {
  NODE_ENV: process.env.NODE_ENV,
  HAS_APP_NAME: !!process.env.NEW_RELIC_APP_NAME,
  HAS_LICENSE_KEY: !!process.env.NEW_RELIC_LICENSE_KEY,
  APP_NAME: process.env.NEW_RELIC_APP_NAME || 'NOT SET',
})

// Only enable New Relic if both app name and license key are provided
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
      level: 'info',
      filepath: 'stdout', // Log to stdout for CloudWatch
    },
    distributed_tracing: {
      enabled: true,
    },
    // Enable application_logging to see logs in New Relic
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
}
