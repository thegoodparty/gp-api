import {
  GetObjectCommand,
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

const { AWS_REGION: region = 'us-west-2' } = process.env
const EXPIRES_IN_DEFAULT = 3600 // 1 hour

export type UploadFileOptions = {
  cacheControl?: string
  contentType?: string
  metadata?: Record<string, string>
  baseUrl?: string
  slugifyFileName?: boolean
}

export type GetSignedUrlOptions = {
  expiresIn?: number
  contentType?: string
  slugifyFileName?: boolean
}

export type GetFileOptions = {
  slugifyFileName?: boolean
}

@Injectable()
export class S3Service extends AwsService {
  private readonly s3Client: S3Client

  constructor() {
    super()
    this.s3Client = new S3Client({ region })
  }

  private buildKey(
    folderPath?: string,
    fileName?: string,
    slugifyFileName: boolean = true,
  ): string {
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
    fileName: string,
    folderPath?: string,
    options?: UploadFileOptions,
  ) {
    const key = this.buildKey(
      folderPath,
      fileName,
      options?.slugifyFileName ?? true,
    )

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
    fileName: string,
    folderPath?: string,
    options?: GetSignedUrlOptions,
  ) {
    const key = this.buildKey(
      folderPath,
      fileName,
      options?.slugifyFileName ?? true,
    )

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
    fileName: string,
    folderPath?: string,
    options?: GetSignedUrlOptions,
  ) {
    const key = this.buildKey(
      folderPath,
      fileName,
      options?.slugifyFileName ?? true,
    )

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

  async getFile(
    bucket: string,
    fileName: string,
    folderPath?: string,
    options?: GetFileOptions,
  ): Promise<string | undefined> {
    const key = this.buildKey(
      folderPath,
      fileName,
      options?.slugifyFileName ?? true,
    )

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

  getFileUrl(
    bucket: string,
    fileName: string,
    folderPath?: string,
    options?: { baseUrl?: string; slugifyFileName?: boolean },
  ): string {
    const key = this.buildKey(
      folderPath,
      fileName,
      options?.slugifyFileName ?? true,
    )
    return this.buildUrl(bucket, key, options?.baseUrl)
  }
}
