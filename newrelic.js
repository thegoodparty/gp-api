'use strict'
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config()

// Only enable New Relic if both app name and license key are provided
if (!process.env.NEW_RELIC_APP_NAME || !process.env.NEW_RELIC_LICENSE_KEY) {
  console.log(
    'New Relic disabled: Missing NEW_RELIC_APP_NAME or NEW_RELIC_LICENSE_KEY',
  )
  module.exports = {}
} else {
  console.log(`New Relic enabled for: ${process.env.NEW_RELIC_APP_NAME}`)

  exports.config = {
    app_name: [process.env.NEW_RELIC_APP_NAME],
    license_key: process.env.NEW_RELIC_LICENSE_KEY,
    logging: {
      level: 'info',
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
