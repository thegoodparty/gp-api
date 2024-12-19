import { Injectable } from '@nestjs/common'

@Injectable()
export class SlackService {
  // TODO: placeholder service for slack logging

  async errorLoggerHelper(...args: any[]) {
    console.log('SLACK ERROR LOGGER', args)
  }

  async aiLoggerHelper(...args: any[]) {
    console.log('SLACK AI LOGGER', args)
  }

  async slackHelper(...args: any[]) {
    console.log('SLACK BASIC LOGGER', args)
  }
}
