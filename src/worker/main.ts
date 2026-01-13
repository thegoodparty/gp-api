import { Logger } from '@nestjs/common'
import { bootstrapWorker } from './app'

const WORKER_CONFIG = {
  port: Number(process.env.WORKER_PORT) || 3002,
  host: process.env.HOST || '0.0.0.0',
}

bootstrapWorker({ loggingEnabled: true }).then(async (app) => {
  await app.listen(WORKER_CONFIG)
  const logger = new Logger('worker-bootstrap')
  logger.log(
    `Inngest worker listening on ${WORKER_CONFIG.host}:${WORKER_CONFIG.port}`,
  )
  logger.log('Visit Inngest Dev Server at http://localhost:3001')
})
