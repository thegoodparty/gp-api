import { Logger } from '@nestjs/common'
import { bootstrap } from './app'
import { InngestService } from './inngest/inngest.service'

const APP_LISTEN_CONFIG = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
}

bootstrap({ loggingEnabled: true }).then(async (app) => {
  // Register Inngest routes
  const inngestService = app.get(InngestService)
  await inngestService.registerRoutes(app.getHttpAdapter().getInstance())

  await app.listen(APP_LISTEN_CONFIG)
  const logger = new Logger('bootstrap')
  logger.log(
    `App bootstrap successful => ${APP_LISTEN_CONFIG.host}:${APP_LISTEN_CONFIG.port}`,
  )
  logger.log('Inngest routes registered at /api/inngest')
})
