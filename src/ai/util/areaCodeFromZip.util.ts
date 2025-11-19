import { Injectable, Logger } from '@nestjs/common'
import { differenceInYears, formatISO } from 'date-fns'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { AiService } from '../ai.service'

const ZIP_TO_AREA_CODE_FILE = 'zip-to-area-code-mappings.json'
const CACHE_EXPIRY_YEARS = 1

type ZipToAreaCodeEntry = {
  areaCodes: string[]
  lastFetchedAt: string // ISO datestring
}

type ZipToAreaCodeMapping = Record<string, ZipToAreaCodeEntry>

@Injectable()
export class AreaCodeFromZipService {
  private readonly logger = new Logger(AreaCodeFromZipService.name)

  constructor(
    private readonly s3Service: S3Service,
    private readonly aiService: AiService,
  ) { }

  /**
   * Gets area codes for a given zip code.
   * First checks S3 cache, then falls back to OpenAI if not found.
   * Automatically saves new mappings to S3.
   */
  async getAreaCodeFromZip(zipCode: string): Promise<string[] | null> {
    if (!zipCode) {
      return null
    }

    const normalizedZipCode = zipCode.split('-')[0].trim()

    // Check cache first
    const cachedEntry = await this.getAreaCodesFromS3(normalizedZipCode)
    if (cachedEntry) {
      const isExpired = this.isCacheExpired(cachedEntry.lastFetchedAt)
      if (!isExpired) {
        this.logger.debug(
          `Found valid cached area codes for ${normalizedZipCode}`,
          cachedEntry.areaCodes,
        )
        return cachedEntry.areaCodes
      }
      this.logger.debug(
        `Cached area codes for ${normalizedZipCode} expired, re-fetching from OpenAI`,
      )
    }

    this.logger.debug(
      `Area codes for zip code ${normalizedZipCode} not found in cache, calling OpenAI`,
    )
    const areaCodes = await this.getAreaCodesFromOpenAI(normalizedZipCode)

    if (areaCodes && areaCodes.length > 0) {
      await this.saveAreaCodesToS3(normalizedZipCode, areaCodes)
      return areaCodes
    }

    return null
  }

  private isCacheExpired(lastFetchedAt: string): boolean {
    const lastFetched = new Date(lastFetchedAt)
    const now = new Date()

    return differenceInYears(now, lastFetched) >= CACHE_EXPIRY_YEARS
  }

  private async getAreaCodesFromS3(
    zipCode: string,
  ): Promise<ZipToAreaCodeEntry | null> {
    try {
      const bucket = process.env.ZIP_TO_AREA_CODE_BUCKET
      if (!bucket) {
        throw new Error(
          'ZIP_TO_AREA_CODE_BUCKET environment variable is required',
        )
      }
      const key = this.s3Service.buildKey(undefined, ZIP_TO_AREA_CODE_FILE)
      const json = await this.s3Service.getFile(bucket, key)

      if (!json) {
        return null
      }

      const mappings = JSON.parse(json) as ZipToAreaCodeMapping
      return mappings[zipCode] || null
    } catch (error) {
      this.logger.error(`Error getting area code mappings from S3: ${error}`)
      return null
    }
  }

  private async getAreaCodesFromOpenAI(
    zipCode: string,
  ): Promise<string[] | null> {
    const prompt = `What are the area codes (NPA codes) for the zip code ${zipCode} in the United States?
      Please respond with ONLY a JSON array of ara code strings (3-digit numbers), for example: ["415", "510].
      If you cannot determin the ara codes, respond with an empty array: [].`

    try {
      const response = await this.aiService.llmChatCompletion(
        [
          {
            role: 'user',
            content: prompt,
          },
        ],
        100,
        0.1,
        0.1,
      )

      if (!response?.content || typeof response.content !== 'string') {
        return null
      }

      const content = response.content.trim()
      const jsonContent = content
        .replace(/\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      const areaCodes = JSON.parse(jsonContent) as unknown

      if (
        Array.isArray(areaCodes) &&
        areaCodes.every((code) => typeof code === 'string')
      ) {
        return areaCodes as string[]
      }
      return null
    } catch (error) {
      this.logger.error(
        `Error getting area codes from OpenAI for zip ${zipCode}: ${error}`,
      )
      return null
    }
  }

  private async saveAreaCodesToS3(
    zipCode: string,
    areaCodes: string[],
  ): Promise<void> {
    try {
      const bucket = process.env.ZIP_TO_AREA_CODE_BUCKET
      if (!bucket) {
        throw new Error(
          'ZIP_TO_AREA_CODE_BUCKET environment variable is required',
        )
      }
      const key = this.s3Service.buildKey(undefined, ZIP_TO_AREA_CODE_FILE)
      let mappings: ZipToAreaCodeMapping = {}

      const existingfile = await this.s3Service.getFile(bucket, key)
      if (existingfile) {
        mappings = JSON.parse(existingfile) as ZipToAreaCodeMapping
      }

      mappings[zipCode] = { areaCodes, lastFetchedAt: formatISO(new Date()) }

      await this.s3Service.uploadFile(
        bucket,
        JSON.stringify(mappings, null, 2),
        key,
        { contentType: 'application/json' },
      )

      this.logger.debug(`Saved area codes for ${zipCode} to S3`)
    } catch (error) {
      this.logger.error(`Error saving area codes to S3 for ${zipCode}:${error}`)
    }
  }
}
