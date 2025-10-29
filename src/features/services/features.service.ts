import { Injectable, Logger } from '@nestjs/common'
import { UsersService } from '../../users/services/users.service'
import { Experiment } from '@amplitude/experiment-node-server'
import { User } from '@prisma/client'

const AMPLITUDE_PROJECT_API_KEY = process.env.AMPLITUDE_PROJECT_API_KEY
if (!AMPLITUDE_PROJECT_API_KEY) {
  throw new Error('AMPLITUDE_PROJECT_API_KEY is not set')
}

const amplitude = Experiment.initializeRemote(AMPLITUDE_PROJECT_API_KEY)

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name)

  constructor(private readonly usersService: UsersService) {}

  /**
   * Determines if the specified feature is enabled for the given user.
   *
   * Throws an error if the Amplitude service failes to return a value.
   */
  async isFeatureEnabled(params: {
    user: number | User
    feature: string
  }): Promise<boolean> {
    const user =
      typeof params.user === 'number'
        ? await this.usersService.findUniqueOrThrow({
            where: { id: params.user },
          })
        : params.user

    const variants = await amplitude.fetchV2({
      user_id: user.id.toString(),
      user_properties: {
        email: user.email,
      },
    })

    const value = variants[params.feature]?.value === 'on'

    this.logger.log(
      JSON.stringify({
        userId: user.id,
        feature: params.feature,
        value,
        msg: 'Calculated feature toggle for user',
      }),
    )

    return value
  }
}
