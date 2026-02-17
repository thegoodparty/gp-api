import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  StreamableFile,
} from '@nestjs/common'
import { Pool } from 'pg'
import { to as copyTo } from 'pg-copy-streams'
import { PassThrough } from 'stream'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const UTF8_BOM = '\uFEFF'

const DATABASE_URL = process.env.DATABASE_URL as string

@Injectable()
export class PollResponsesDownloadService implements OnModuleDestroy {
  private readonly logger = new Logger(PollResponsesDownloadService.name)
  private readonly pool: Pool

  constructor() {
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
    if (!UUID_RE.test(pollId)) {
      throw new BadRequestException('Invalid poll ID format')
    }

    const client = await this.pool.connect()

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
      WHERE pim.poll_id = '${pollId}'
      ORDER BY pim.sent_at
    ) TO STDOUT WITH (FORMAT CSV, HEADER TRUE)`

    const output = new PassThrough()
    const safePollName = pollName.replace(/[\r\n]/g, ' ')
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
        this.logger.error('COPY stream error', err)
        cleanup()
        output.destroy(err)
      })
      .on('end', () => {
        cleanup()
        output.end()
      })

    copyStream.pipe(output, { end: false })

    return new StreamableFile(output, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${fileName}.csv"`,
    })
  }
}
