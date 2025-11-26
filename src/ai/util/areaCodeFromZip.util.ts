import { Injectable, Logger } from '@nestjs/common'
import { differenceInYears, formatISO } from 'date-fns'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { z } from 'zod'
import { AiService } from '../ai.service'

const ZIP_TO_AREA_CODE_FILE = 'zip-to-area-code-mappings.json'
const CACHE_EXPIRY_YEARS = 1
const ZIP_TO_AREA_CODE_BUCKET = process.env.ZIP_TO_AREA_CODE_BUCKET as string

if (!ZIP_TO_AREA_CODE_BUCKET) {
  throw new Error('ZIP_TO_AREA_CODE_BUCKET environment variable is required')
}

const AreaCodeResponseSchema = z.array(
  z.string().regex(/^\d{3}$/, 'Area code must be a 3-digit number'),
)

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
  ) {}

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
    const key = this.s3Service.buildKey(undefined, ZIP_TO_AREA_CODE_FILE)
    let json: string | undefined

    try {
      json = await this.s3Service.getFile(ZIP_TO_AREA_CODE_BUCKET, key)
    } catch (error) {
      this.logger.error(
        `Error fetching area code mappings file from S3: ${error}`,
        key,
        ZIP_TO_AREA_CODE_BUCKET,
      )
      return null
    }

    if (!json) {
      return null
    }

    try {
      const mappings = JSON.parse(json) as ZipToAreaCodeMapping
      return mappings[zipCode] || null
    } catch (error) {
      this.logger.error(
        `Error parsing area code mappings JSON from S3: ${error}`,
        json,
      )
      return null
    }
  }

  private async getAreaCodesFromOpenAI(
    zipCode: string,
  ): Promise<string[] | null> {
    const prompt = `What are the area codes (NPA codes) for the zip code ${zipCode} in the United States?
      Please respond with ONLY a JSON array of area code strings (3-digit numbers), for example: ["415", "510"].
      If you cannot determine the area codes, respond with an empty array: [].`

    let jsonContent: string

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
      jsonContent = content
        .replace(/\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
    } catch (error) {
      this.logger.error(
        `Error calling OpenAI API for area codes (zip ${zipCode}): ${error}`,
      )
      return null
    }

    try {
      const parsed = JSON.parse(jsonContent)
      const validationResult = AreaCodeResponseSchema.safeParse(parsed)

      if (!validationResult.success) {
        this.logger.error(
          `Invalid area codes response format from OpenAI for zip ${zipCode}:`,
          validationResult.error.errors,
          'Raw response:',
          jsonContent,
        )
        return null
      }

      return validationResult.data
    } catch (error) {
      this.logger.error(
        `Error parsing JSON response from OpenAI for zip ${zipCode}: ${error}`,
        'Raw response:',
        jsonContent,
      )
      return null
    }
  }

  private async saveAreaCodesToS3(
    zipCode: string,
    areaCodes: string[],
  ): Promise<void> {
    const key = this.s3Service.buildKey(undefined, ZIP_TO_AREA_CODE_FILE)
    let mappings: ZipToAreaCodeMapping = {}

    let existingfile: string | undefined

    try {
      existingfile = await this.s3Service.getFile(ZIP_TO_AREA_CODE_BUCKET, key)
    } catch (error) {
      this.logger.error(
        `Error fetching existing area code mappings from S3: ${error}`,
        key,
        ZIP_TO_AREA_CODE_BUCKET,
      )
    }

    if (existingfile) {
      try {
        mappings = JSON.parse(existingfile) as ZipToAreaCodeMapping
      } catch (error) {
        this.logger.error(
          `Error parsing existing area code mappings JSON from S3: ${error}`,
          existingfile,
        )
      }
    }

    mappings[zipCode] = { areaCodes, lastFetchedAt: formatISO(new Date()) }

    try {
      await this.s3Service.uploadFile(
        ZIP_TO_AREA_CODE_BUCKET,
        JSON.stringify(mappings, null, 2),
        key,
        { contentType: 'application/json' },
      )

      this.logger.debug(`Saved area codes for ${zipCode} to S3`)
    } catch (error) {
      this.logger.error(
        `Error uploading area codes to S3 for ${zipCode}: ${error}`,
        key,
        ZIP_TO_AREA_CODE_BUCKET,
      )
    }
  }
}
