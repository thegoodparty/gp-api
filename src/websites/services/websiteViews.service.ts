import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { getDateRangeWithDefaults } from 'src/shared/util/date.util'

// 1 minute to help prevent duplicate views for spamming refreshes, etc
const RATE_LIMIT_WINDOW = 60 * 1000

@Injectable()
export class WebsiteViewsService extends createPrismaBase(MODELS.WebsiteView) {
  async trackWebsiteView(websiteId: number, visitorId: string) {
    const recentView = await this.findFirst({
      where: {
        websiteId,
        visitorId,
        createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW) },
      },
    })

    if (recentView) {
      return
    }

    return await this.model.create({
      data: {
        websiteId,
        visitorId,
      },
    })
  }

  async getWebsiteViews(websiteId: number, startDate?: Date, endDate?: Date) {
    const { startDate: queryStartDate, endDate: queryEndDate } =
      getDateRangeWithDefaults(startDate, endDate)

    return await this.findMany({
      where: {
        websiteId,
        createdAt: {
          gte: queryStartDate,
          lte: queryEndDate,
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }
}
