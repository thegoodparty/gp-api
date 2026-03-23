import { Logger } from '@nestjs/common'
import { bootstrap } from './app'

const APP_LISTEN_CONFIG = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
}

bootstrap({ loggingEnabled: true }).then(async (app) => {
  await app.listen(APP_LISTEN_CONFIG)
  const logger = new Logger('bootstrap')
  logger.log(
    `App bootstrap successful => ${APP_LISTEN_CONFIG.host}:${APP_LISTEN_CONFIG.port}`,
  )
})
