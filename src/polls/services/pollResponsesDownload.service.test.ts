import { PassThrough, Readable } from 'stream'
import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PollResponsesDownloadService } from './pollResponsesDownload.service'

const mockRelease = vi.fn()
const mockPoolEnd = vi.fn()
const mockClientQuery = vi.fn()
const mockPoolConnect = vi.fn()

vi.mock('pg', () => {
  const PoolClass = function () {
    // @ts-expect-error -- mock constructor
    this.connect = mockPoolConnect
    // @ts-expect-error -- mock constructor
    this.end = mockPoolEnd
  }
  return { Pool: PoolClass }
})

vi.mock('pg-copy-streams', () => ({
  to: vi.fn((sql: string) => sql),
}))

async function drainStream(stream: Readable): Promise<string> {
  const chunks: string[] = []
  for await (const chunk of stream) {
    chunks.push(chunk.toString())
  }
  return chunks.join('')
}

describe('PollResponsesDownloadService', () => {
  let service: PollResponsesDownloadService
  let copyStream: PassThrough

  beforeEach(() => {
    vi.clearAllMocks()

    copyStream = new PassThrough()
    mockClientQuery.mockReturnValue(copyStream)
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
      escapeLiteral: (str: string) => `'${str.replace(/'/g, "''")}'`,
    })

    service = new PollResponsesDownloadService()
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  afterEach(() => {
    if (!copyStream.destroyed) copyStream.destroy()
  })

  describe('streamPollResponses', () => {
    const VALID_UUID = '01234567-89ab-cdef-0123-456789abcdef'
    const POLL_NAME = 'My Test Poll'
    const FILE_NAME = 'My Test Poll'

    it('returns a StreamableFile', async () => {
      const result = await service.streamPollResponses(
        VALID_UUID,
        POLL_NAME,
        FILE_NAME,
      )
      copyStream.end()

      expect(result).toBeDefined()
      expect(result.getHeaders().type).toBe('text/csv; charset=utf-8')
      expect(result.getHeaders().disposition).toContain(FILE_NAME)
    })

    it('writes UTF-8 BOM and poll name as the first line', async () => {
      const result = await service.streamPollResponses(
        VALID_UUID,
        POLL_NAME,
        FILE_NAME,
      )
      copyStream.end()

      const output = await drainStream(result.getStream())
      expect(output.startsWith('\uFEFF' + POLL_NAME + '\n')).toBe(true)
    })

    it('sanitizes newlines from poll name', async () => {
      const result = await service.streamPollResponses(
        VALID_UUID,
        'Poll\nWith\rNewlines',
        FILE_NAME,
      )
      copyStream.end()

      const output = await drainStream(result.getStream())
      expect(output.startsWith('\uFEFFPoll With Newlines\n')).toBe(true)
    })

    it('uses fallback when poll name is empty or whitespace', async () => {
      const result = await service.streamPollResponses(
        VALID_UUID,
        '   ',
        FILE_NAME,
      )
      copyStream.end()

      const output = await drainStream(result.getStream())
      expect(output.startsWith('\uFEFFPoll responses\n')).toBe(true)
    })

    it('strips leading newlines from COPY stream to avoid empty rows', async () => {
      const result = await service.streamPollResponses(
        VALID_UUID,
        POLL_NAME,
        FILE_NAME,
      )

      copyStream.write('\n\n\nmessage_content,associated_clusters\n')
      copyStream.write('"Hello world","Issue A"\n')
      copyStream.end()

      const output = await drainStream(result.getStream())
      const lines = output.split('\n')
      expect(lines[0]).toBe('\uFEFF' + POLL_NAME)
      expect(lines[1]).toBe('message_content,associated_clusters')
      expect(lines[2]).toBe('"Hello world","Issue A"')
    })

    it('builds COPY SQL with the poll ID', async () => {
      const { to: copyTo } = await import('pg-copy-streams')

      await service.streamPollResponses(VALID_UUID, POLL_NAME, FILE_NAME)
      copyStream.end()

      expect(vi.mocked(copyTo)).toHaveBeenCalledWith(
        expect.stringContaining(`pim.poll_id = '${VALID_UUID}'`),
      )
      expect(vi.mocked(copyTo)).toHaveBeenCalledWith(
        expect.stringContaining('TO STDOUT WITH (FORMAT CSV, HEADER TRUE)'),
      )
    })

    it('SQL includes string_agg with DISTINCT and alphabetical ordering', async () => {
      const { to: copyTo } = await import('pg-copy-streams')

      await service.streamPollResponses(VALID_UUID, POLL_NAME, FILE_NAME)
      copyStream.end()

      const sql = vi.mocked(copyTo).mock.calls[0][0] as string
      expect(sql).toContain("string_agg(DISTINCT pi.title, '; '")
      expect(sql).toContain('ORDER BY pi.title')
      expect(sql).toContain('_PollIndividualMessageToPollIssue')
      expect(sql).toContain('is_opt_out')
    })

    it('pipes COPY stream data after the poll name line', async () => {
      const result = await service.streamPollResponses(
        VALID_UUID,
        POLL_NAME,
        FILE_NAME,
      )

      copyStream.write('message_content,associated_clusters\n')
      copyStream.write('"Hello world","Issue A; Issue B"\n')
      copyStream.end()

      const output = await drainStream(result.getStream())
      const lines = output.split('\n')
      expect(lines[0]).toBe('\uFEFF' + POLL_NAME)
      expect(lines[1]).toBe('message_content,associated_clusters')
      expect(lines[2]).toBe('"Hello world","Issue A; Issue B"')
    })

    it('releases the client when stream ends', async () => {
      await service.streamPollResponses(VALID_UUID, POLL_NAME, FILE_NAME)
      copyStream.end()

      // Allow microtasks to flush
      await new Promise((r) => setImmediate(r))

      expect(mockRelease).toHaveBeenCalledTimes(1)
    })

    it('releases the client and propagates error on stream failure', async () => {
      const result = await service.streamPollResponses(
        VALID_UUID,
        POLL_NAME,
        FILE_NAME,
      )

      const error = new Error('pg connection lost')
      copyStream.destroy(error)

      await expect(drainStream(result.getStream())).rejects.toThrow(
        'pg connection lost',
      )
      expect(mockRelease).toHaveBeenCalledTimes(1)
    })

    it('destroys the COPY stream when output is destroyed', async () => {
      const destroySpy = vi.spyOn(copyStream, 'destroy')

      const result = await service.streamPollResponses(
        VALID_UUID,
        POLL_NAME,
        FILE_NAME,
      )

      result.getStream().destroy()

      await new Promise((r) => setImmediate(r))

      expect(destroySpy).toHaveBeenCalled()
      expect(mockRelease).toHaveBeenCalled()
    })
  })

  describe('onModuleDestroy', () => {
    it('closes the pool', () => {
      service.onModuleDestroy()
      expect(mockPoolEnd).toHaveBeenCalledTimes(1)
    })
  })
})
