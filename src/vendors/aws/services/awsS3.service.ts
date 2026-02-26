import {
  GetObjectCommand,
  NoSuchKey,
  ObjectCannedACL,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable } from '@nestjs/common'
import slugify from 'slugify'
import { ASSET_DOMAIN } from 'src/shared/util/appEnvironment.util'
import { AwsService } from './aws.service'

export type UploadOptions = {
  cacheControl?: string // Cache-Control header value
}

const { AWS_REGION: region = 'us-west-2' } = process.env

/**
 * Legacy S3 service hardcoded to use ASSET_DOMAIN bucket.
 *
 * @deprecated This service is being gradually migrated to the new S3Service.
 * Use S3Service for new features that require flexible bucket/subfolder support.
 *
 * Migration Reference - Current Consumers:
 *
 * 1. FilesService (src/files/files.service.ts)
 *    - Uses: getSignedS3Url(), uploadFile()
 *    - Methods: generateSignedUploadUrl(), uploadFile(), uploadFiles()
 *    - Migration: Replace with S3Service.getSignedUrlForUpload() and S3Service.uploadFile()
 *
 * Note: This service always uses ASSET_DOMAIN as the bucket and has limited flexibility.
 * The new S3Service supports multiple buckets, subfolders, and more configuration options.
 */
@Injectable()
export class AwsS3Service extends AwsService {
  private readonly s3Client: S3Client

  constructor() {
    super()

    this.s3Client = new S3Client({ region })
  }

  getKey(params: { bucket: string; fileName: string }) {
    return `${params.bucket}/${slugify(params.fileName, {
      lower: true,
      trim: true,
    })}`
  }

  async getFile(params: { bucket: string; fileName: string }) {
    return this.executeAwsOperation(async () => {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: ASSET_DOMAIN,
            Key: this.getKey(params),
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

  async uploadFile(
    fileObject: PutObjectCommandInput['Body'],
    bucket: string,
    fileName: string,
    fileType: string,
    options?: UploadOptions,
  ) {
    const filePath = this.getKey({ bucket, fileName })
    return this.executeAwsOperation(async () => {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: ASSET_DOMAIN,
          Key: filePath,
          Body: fileObject,
          ContentType: fileType,
          CacheControl: options?.cacheControl,
          ACL: ObjectCannedACL.public_read,
        },
      })
      const response = await upload.done()

      return `https://${ASSET_DOMAIN}/${response.Key || filePath}`
    }, 'uploadFile')
  }

  async getSignedS3Url(bucket: string, fileName: string, fileType: string) {
    const filePath = `${bucket}/${fileName}`

    this.logger.debug(
      {
        Bucket: ASSET_DOMAIN,
        Key: filePath,
        ContentType: fileType,
      },
      `Getting signed URL for ${filePath}`,
    )

    return this.executeAwsOperation(async () => {
      return await getSignedUrl(
        this.s3Client,
        new PutObjectCommand({
          Bucket: ASSET_DOMAIN,
          Key: filePath,
          ContentType: fileType,
        }),
        { expiresIn: 3600 },
      )
    }, 'getSignedS3Url')
  }
}
