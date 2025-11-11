import { Injectable, Logger } from "@nestjs/common";
import { AwsS3Service } from "src/vendors/aws/services/awsS3.service";
import { AiService } from "../ai.service";

const ZIP_TO_AREA_CODE_BUCKET = 'zip-to-area-code-mappings'
const ZIP_TO_AREA_CODE_FILE = 'zip-to-area-code-mappings.json'


type ZipToAreaCodeMapping = Record<string, string[]>;


@Injectable()
export class AreaCodeFromZipService {
  private readonly logger = new Logger(AreaCodeFromZipService.name)

  constructor(
    private readonly awsS3Service: AwsS3Service,
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

    const cachedAreaCodes = await this.getAreaCodesFromS3(normalizedZipCode)
    if (cachedAreaCodes) {
      this.logger.debug(`Found cached area codes for ${normalizedZipCode}`, cachedAreaCodes)
      return cachedAreaCodes
    }

    this.logger.debug(`Area codes for zip code ${normalizedZipCode} not found in cache, calling OpenAI`)
    const areaCodes = await this.getAreaCodesFromOpenAI(normalizedZipCode)

    if (areaCodes && areaCodes.length > 0) {
      await this.saveAreaCodesToS3(normalizedZipCode, areaCodes)
      return areaCodes
    }

    return null
  }

  private async getAreaCodesFromS3(zipCode: string): Promise<string[] | null> {
    try {
      const fileContent = await this.awsS3Service.getFile({
        bucket: ZIP_TO_AREA_CODE_BUCKET,
        fileName: ZIP_TO_AREA_CODE_FILE,
      })

      if (!fileContent) {
        return null
      }

      const mappings: ZipToAreaCodeMapping = JSON.parse(fileContent)
      return mappings[zipCode] || null
    } catch (error) {
      this.logger.error(`Error getting area code mappings from S3: ${error}`)
      return null
    }
  }

  private async getAreaCodesFromOpenAI(zipCode: string): Promise<string[] | null> {
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

      if (!response.content) {
        return null
      }

      const content = response.content.trim()
      const jsonContent = content.replace(/\n?/g, '').replace(/```\n?/g, '').trim()
      const areaCodes = JSON.parse(jsonContent)

      if (Array.isArray(areaCodes) && areaCodes.every(code => typeof code === 'string')) {
        return areaCodes
      }
      return null
    } catch (error) {
      this.logger.error(`Error getting area codes from OpenAI for zip ${zipCode}: ${error}`)
      return null
    }
  }

  private async saveAreaCodesToS3(zipCode: string, areaCodes: string[]): Promise<void> {
    try {
      let mappings: ZipToAreaCodeMapping = {}
      const existingFile = await this.awsS3Service.getFile({
        bucket: ZIP_TO_AREA_CODE_BUCKET,
        fileName: ZIP_TO_AREA_CODE_FILE,
      })

      if (existingFile) {
        mappings = JSON.parse(existingFile)
      }

      mappings[zipCode] = areaCodes

      await this.awsS3Service.uploadFile(
        JSON.stringify(mappings, null, 2),
        ZIP_TO_AREA_CODE_BUCKET,
        ZIP_TO_AREA_CODE_FILE,
        'application/json'
      )

      this.logger.debug(`Saved area codes for ${zipCode} to S3`)
    } catch (error) {
      this.logger.error(`Error saving area codes to S3 for ${zipCode}:${error}`)
    }
  }
}
