import { Injectable, Logger, StreamableFile } from '@nestjs/common'
import { Client as PostgresClient } from 'pg'
import { to as copyTo } from 'pg-copy-streams'
import { PassThrough, Transform } from 'stream'
import { HEADER_MAPPING } from './constants/headerMapping.const'
import { SlackService } from 'src/shared/services/slack.service'

const VOTER_DATASTORE = process.env.VOTER_DATASTORE as string

@Injectable()
export class VoterDataService {
  private readonly logger = new Logger(VoterDataService.name)

  constructor(private readonly slack: SlackService) {}

  async query(queryString: string) {
    const client = new PostgresClient({
      connectionString: VOTER_DATASTORE,
    })
    await client.connect()
    const result = await client.query(queryString)
    await client.end()

    return result
  }

  async csvStream(queryString: string, fileName: string = 'people') {
    const client = new PostgresClient({
      connectionString: VOTER_DATASTORE,
    })
    await client.connect()

    // Define the mapping of old headers to new headers
    let isFirstChunk = true
    const transformHeaders = new Transform({
      objectMode: true,
      transform(chunk, _encoding, callback) {
        let data: string = chunk.toString()
        if (isFirstChunk) {
          isFirstChunk = false
          // Replace headers on the first chunk
          for (const [oldHeader, newHeader] of Object.entries(HEADER_MAPPING)) {
            data = data.replace(oldHeader, newHeader)
          }
        }
        callback(null, data)
      },
    })

    const stream = client.query(
      copyTo(`COPY(${queryString}) TO STDOUT WITH CSV HEADER`),
    )
    const passThrough = new PassThrough()

    stream.on('error', async (err) => {
      this.logger.error('Error in stream:', err)
      await this.slack.errorMessage('Error in stream:', err)
      throw err
    })

    passThrough.on('end', async () => {
      await client.end()
    })

    passThrough.on('error', async (err) => {
      this.logger.error('Error in PassThrough stream:', err)
      await this.slack.errorMessage('Error in PassThrough stream', err)
      throw err
    })

    return new StreamableFile(stream.pipe(transformHeaders).pipe(passThrough), {
      type: 'text/csv',
      disposition: `attachment; filename="${fileName}.csv"`,
    })
  }
}
