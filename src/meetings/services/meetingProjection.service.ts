import { Injectable } from '@nestjs/common'
import { rrulestr } from 'rrule'
import { formatInTimeZone } from 'date-fns-tz'
import { MeetingScheduleArtifact } from '@goodparty_org/contracts'

export type ProjectArgs = {
  schedule: MeetingScheduleArtifact
  from: Date
  to: Date
}

@Injectable()
export class MeetingProjectionService {
  project({ schedule, from, to }: ProjectArgs): string[] {
    if (schedule.status === 'not_found') return []

    const anchorDate = formatInTimeZone(from, schedule.timezone, 'yyyyMMdd')
    const anchorTime = schedule.time.replace(':', '') + '00'

    const rule = rrulestr(
      `DTSTART:${anchorDate}T${anchorTime}\nRRULE:${schedule.rrule}`,
    )

    return rule
      .between(from, to, true)
      .map((d) => formatInTimeZone(d, 'UTC', 'yyyy-MM-dd'))
  }
}
