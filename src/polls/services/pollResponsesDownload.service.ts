import { Injectable, OnModuleDestroy, StreamableFile } from '@nestjs/common'
import { Pool } from 'pg'
import { to as copyTo } from 'pg-copy-streams'
import { PassThrough } from 'stream'
import { stripLeadingNewlines } from '../utils/polls.utils'
import { PinoLogger } from 'nestjs-pino'

const UTF8_BOM = '\uFEFF'

const DATABASE_URL = process.env.DATABASE_URL as string

@Injectable()
export class PollResponsesDownloadService implements OnModuleDestroy {
  private readonly pool: Pool

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(PollResponsesDownloadService.name)
    this.pool = new Pool({ connectionString: DATABASE_URL })
  }

  onModuleDestroy() {
    this.pool.end()
  }

  async streamPollResponses(
    pollId: string,
    pollName: string,
    fileName: string,
  ): Promise<StreamableFile> {
    const client = await this.pool.connect()

    const escapedPollId = client.escapeLiteral(pollId)
    const sql = `COPY (
      SELECT
        pim.content AS message_content,
        COALESCE(
          (
            SELECT string_agg(DISTINCT pi.title, '; ' ORDER BY pi.title)
            FROM "_PollIndividualMessageToPollIssue" j
            JOIN poll_issues pi ON pi.id = j."B"
            WHERE j."A" = pim.id
          ),
          ''
        ) AS associated_clusters
      FROM poll_individual_message pim
      WHERE pim.poll_id = ${escapedPollId}
        AND pim.sender = 'CONSTITUENT'
        AND (pim.is_opt_out IS NULL OR pim.is_opt_out = false)
      ORDER BY pim.sent_at
    ) TO STDOUT WITH (FORMAT CSV, HEADER TRUE)`

    const output = new PassThrough()
    const safePollName =
      pollName.replace(/[\r\n]/g, ' ').trim() || 'Poll responses'
    output.write(UTF8_BOM + safePollName + '\n')

    let released = false
    const cleanup = () => {
      if (released) return
      released = true
      client.release()
    }

    const copyStream = client.query(copyTo(sql))

    output.on('close', () => {
      copyStream.destroy()
      cleanup()
    })

    copyStream
      .on('error', (err) => {
        this.logger.error(err, 'COPY stream error')
        cleanup()
        output.destroy(err)
      })
      .on('end', () => {
        cleanup()
        output.end()
      })

    copyStream.pipe(stripLeadingNewlines()).pipe(output, { end: false })

    return new StreamableFile(output, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${fileName}.csv"`,
    })
  }
}
