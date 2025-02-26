import { Injectable, Logger } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'

const CHECK_DELAY = 1000
const TIMER_TIMEOUT = 2000

type ProcessTimer = {
  uuid: string
  name: string
  startTime: bigint
}

type ProcessTimersMap = Map<string, ProcessTimer>

const registry = new FinalizationRegistry((intervalId: NodeJS.Timeout) =>
  clearInterval(intervalId),
)

@Injectable()
export class ProcessTimersService {
  private readonly logger = new Logger(ProcessTimersService.name)
  private timers: ProcessTimersMap = new Map()
  private readonly checkIntervalId: NodeJS.Timeout

  constructor() {
    this.checkIntervalId = setInterval(() => this.checkTimers(), CHECK_DELAY)
    registry.register(this, this.checkIntervalId)
  }

  start(name: string): string {
    const uuid = uuidv4()
    const startTime = process.hrtime.bigint()
    this.timers.set(uuid, { uuid, name, startTime })
    this.logger.debug(`Timer started: ${name} (ID: ${uuid})`)
    return uuid
  }

  end(uuid: string): void {
    const timer = this.timers.get(uuid)
    if (!timer) {
      this.logger.error(`Timer with ID ${uuid} not found`)
      return
    }
    const endTime = process.hrtime.bigint()
    const duration = (endTime - timer.startTime) / BigInt(1_000_000) // Convert to milliseconds
    this.logger.debug(
      `Timer ended: ${timer.name} (ID: ${uuid}) - Duration: ${duration} ms`,
    )
    this.timers.delete(uuid)
  }

  private checkTimers(): void {
    const now = process.hrtime.bigint()
    this.timers.forEach((timer, uuid) => {
      const duration = (now - timer.startTime) / BigInt(1_000_000) // Convert to milliseconds
      if (duration > TIMER_TIMEOUT) {
        this.logger.warn(
          `Timer timed out: ${timer.name} (ID: ${uuid}) - Duration: ${duration} ms`,
        )
        this.timers.delete(uuid)
      }
    })
  }
}
