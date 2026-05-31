import {
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable } from '@nestjs/common'
import slugify from 'slugify'
import { AwsService } from './aws.service'
import { PinoLogger } from 'nestjs-pino'

const { AWS_REGION: region = 'us-west-2' } = process.env
const EXPIRES_IN_DEFAULT = 3600 // 1 hour

const isHttpStatusError = (error: unknown, status: number): boolean => {
  if (typeof error !== 'object' || error === null) return false
  if (!('$metadata' in error)) return false
  const meta = (error as { $metadata?: unknown }).$metadata
  if (typeof meta !== 'object' || meta === null) return false
  if (!('httpStatusCode' in meta)) return false
  return (meta as { httpStatusCode?: unknown }).httpStatusCode === status
}

export type UploadFileOptions = {
  cacheControl?: string
  contentType?: string
  metadata?: Record<string, string>
  baseUrl?: string
}

export type GetSignedUrlOptions = {
  expiresIn?: number
  contentType?: string
}

export type BuildKeyOptions = {
  slugifyFileName?: boolean
}

@Injectable()
export class S3Service extends AwsService {
  private readonly s3Client: S3Client

  constructor(protected readonly logger: PinoLogger) {
    super(logger)
    this.s3Client = new S3Client({ region })
  }

  buildKey(
    folderPath?: string,
    fileName?: string,
    options?: BuildKeyOptions,
  ): string {
    const slugifyFileName = options?.slugifyFileName ?? true
    let processedFileName = fileName
    if (slugifyFileName && fileName) {
      processedFileName = slugify(fileName, { lower: true, trim: true })
    }

    if (!folderPath && !processedFileName) {
      return ''
    }
    if (!folderPath) {
      return processedFileName || ''
    }
    if (!processedFileName) {
      return folderPath.endsWith('/') ? folderPath : `${folderPath}/`
    }
    const normalizedFolder = folderPath.endsWith('/')
      ? folderPath
      : `${folderPath}/`
    return `${normalizedFolder}${processedFileName}`
  }

  private buildUrl(bucket: string, key: string, baseUrl?: string): string {
    if (baseUrl) {
      const normalizedBaseUrl = baseUrl.endsWith('/')
        ? baseUrl.slice(0, -1)
        : baseUrl
      return `${normalizedBaseUrl}/${key}`
    }
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
  }

  async uploadFile(
    bucket: string,
    fileObject: PutObjectCommandInput['Body'],
    key: string,
    options?: UploadFileOptions,
  ) {
    return this.executeAwsOperation(async () => {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: fileObject,
          ContentType: options?.contentType,
          CacheControl: options?.cacheControl,
          Metadata: options?.metadata,
        },
      })

      const response = await upload.done()
      return this.buildUrl(bucket, response.Key || key, options?.baseUrl)
    }, 'uploadFile')
  }

  async getSignedUrlForUpload(
    bucket: string,
    key: string,
    options?: GetSignedUrlOptions,
  ) {
    return this.executeAwsOperation(async () => {
      return await getSignedUrl(
        this.s3Client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: options?.contentType,
        }),
        { expiresIn: options?.expiresIn || EXPIRES_IN_DEFAULT },
      )
    }, 'getSignedUrlForUpload')
  }

  async getSignedUrlForViewing(
    bucket: string,
    key: string,
    options?: GetSignedUrlOptions,
  ) {
    return this.executeAwsOperation(async () => {
      return await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
        { expiresIn: options?.expiresIn || EXPIRES_IN_DEFAULT },
      )
    }, 'getSignedUrlForViewing')
  }

  async getFile(bucket: string, key: string): Promise<string | undefined> {
    return this.executeAwsOperation(async () => {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        )
        return response.Body?.transformToString()
      } catch (error) {
        if (error instanceof NoSuchKey) {
          return undefined
        }
        throw error
      }
    }, 'getFile')
  }

  async getFileBytes(bucket: string, key: string): Promise<Buffer | undefined> {
    return this.executeAwsOperation(async () => {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        )
        const bytes = await response.Body?.transformToByteArray()
        return bytes ? Buffer.from(bytes) : undefined
      } catch (error) {
        if (error instanceof NoSuchKey) {
          return undefined
        }
        throw error
      }
    }, 'getFileBytes')
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    return this.executeAwsOperation(async () => {
      try {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
        await this.s3Client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key }),
        )
      } catch (error) {
        if (error instanceof NoSuchKey) return
        throw error
      }
    }, 'deleteObject')
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    return this.executeAwsOperation(async () => {
      try {
        const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
        await this.s3Client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        )
        return true
      } catch (error: unknown) {
        if (error instanceof NoSuchKey) return false
        // S3 HEAD on a missing key surfaces as either NoSuchKey or a plain
        // 404 NotFound depending on permissions; treat both as "missing".
        if (isHttpStatusError(error, 404)) return false
        throw error
      }
    }, 'objectExists')
  }

  async getObjectSize(
    bucket: string,
    key: string,
  ): Promise<number | undefined> {
    return this.executeAwsOperation(async () => {
      try {
        const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
        const head = await this.s3Client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        )
        return head.ContentLength
      } catch (error: unknown) {
        if (error instanceof NoSuchKey) return undefined
        if (isHttpStatusError(error, 404)) return undefined
        throw error
      }
    }, 'getObjectSize')
  }

  getFileUrl(
    bucket: string,
    key: string,
    options?: { baseUrl?: string },
  ): string {
    return this.buildUrl(bucket, key, options?.baseUrl)
  }

  async listKeys(bucket: string, prefix: string): Promise<string[]> {
    return this.executeAwsOperation(async () => {
      const keys: string[] = []
      let continuationToken: string | undefined

      do {
        const response = await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        )

        for (const obj of response.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key)
        }

        continuationToken = response.NextContinuationToken
      } while (continuationToken)

      return keys
    }, 'listKeys')
  }
}
