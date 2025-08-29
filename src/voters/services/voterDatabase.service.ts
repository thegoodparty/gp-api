import {
  Injectable,
  Logger,
  OnModuleDestroy,
  StreamableFile,
} from '@nestjs/common'
import { Pool } from 'pg'
import { to as copyTo } from 'pg-copy-streams'
import { Transform } from 'stream'
import { HEADER_MAPPING } from '../constants/headerMapping.const'
import { SlackService } from 'src/shared/services/slack.service'
import { GetVoterFileSchema } from '../voterFile/schemas/GetVoterFile.schema'

const VOTER_DATASTORE = process.env.VOTER_DATASTORE as string

@Injectable()
export class VoterDatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(VoterDatabaseService.name)
  private readonly pool: Pool

  constructor(private readonly slack: SlackService) {
    this.pool = new Pool({
      connectionString: VOTER_DATASTORE,
    })
  }

  onModuleDestroy() {
    this.pool.end()
  }

  async query(queryString: string) {
    return this.pool.query(queryString)
  }

  async csvStream(
    queryString: string,
    fileName: string = 'people',
    selectedColumns?: GetVoterFileSchema['selectedColumns'],
  ) {
    const client = await this.pool.connect()

    // Build the header mapping
    const headerMapping = { ...HEADER_MAPPING }
    if (selectedColumns?.length) {
      selectedColumns.forEach((col) => {
        if (col.label) {
          headerMapping[col.db] = col.label
        }
      })
    }

    // Define the mapping of old headers to new headers
    let isFirstChunk = true
    const transformHeaders = new Transform({
      objectMode: true,
      transform(chunk, _encoding, callback) {
        let data: string = chunk.toString()
        if (isFirstChunk) {
          isFirstChunk = false
          // Replace headers on the first chunk
          for (const [oldHeader, newHeader] of Object.entries(headerMapping)) {
            data = data.replace(oldHeader, newHeader)
          }
        }
        callback(null, data)
      },
    })

    const stream = client
      .query(copyTo(`COPY(${queryString}) TO STDOUT WITH CSV HEADER`))
      .pipe(transformHeaders)
      .on('error', async (err) => {
        this.logger.error('Error in stream:', err)
        await this.slack.errorMessage({
          message: 'Error in stream:',
          error: err,
        })
        throw err
      })
      .on('end', async () => {
        client.release()
      })

    return new StreamableFile(stream, {
      type: 'text/csv',
      disposition: `attachment; filename="${fileName}.csv"`,
    })
  }

  async csvReadableStream(
    queryString: string,
    selectedColumns?: GetVoterFileSchema['selectedColumns'],
  ) {
    const client = await this.pool.connect()

    // Build the header mapping
    const headerMapping = { ...HEADER_MAPPING }
    if (selectedColumns?.length) {
      selectedColumns.forEach((col) => {
        if (col.label) {
          headerMapping[col.db] = col.label
        }
      })
    }

    // Define the mapping of old headers to new headers
    let isFirstChunk = true
    const transformHeaders = new Transform({
      transform(chunk, _encoding, callback) {
        let data: string = chunk.toString()
        if (isFirstChunk) {
          isFirstChunk = false
          // Replace headers on the first chunk
          for (const [oldHeader, newHeader] of Object.entries(headerMapping)) {
            data = data.replace(oldHeader, newHeader)
          }
        }
        callback(null, data)
      },
    })

    const stream = client
      .query(copyTo(`COPY(${queryString}) TO STDOUT WITH CSV HEADER`))
      .pipe(transformHeaders)
      .on('error', async (err) => {
        this.logger.error('Error in stream:', err)
        await this.slack.errorMessage({
          message: 'Error in stream:',
          error: err,
        })
        client.release()
        throw err
      })
      .on('end', async () => {
        client.release()
      })

    return stream
  }
}
