import { Injectable } from '@nestjs/common'

@Injectable()
export class SlackService {
  // TODO: placeholder service for slack logging

  // sails.helpers.slack.errorLoggerHelper
  async errorMessage(...args: any[]) {
    console.log('SLACK ERROR LOGGER', args)
  }

  // sails.helpers.slack.aiLoggerHelper
  async aiMessage(...args: any[]) {
    console.log('SLACK AI LOGGER', args)
  }

  // sails.helpers.slack.slackHelper
  async message(...args: any[]) {
    console.log('SLACK BASIC LOGGER', args)
  }
}
