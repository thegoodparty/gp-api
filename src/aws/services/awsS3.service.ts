import { Injectable } from '@nestjs/common'
import {
  ObjectCannedACL,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'
import slugify from 'slugify'
import { ASSET_DOMAIN } from 'src/shared/util/appEnvironment.util'
import { AwsService } from './aws.service'

export type UploadOptions = {
  cacheControl?: string // Cache-Control header value
}

const {
  AWS_S3_KEY: accessKeyId,
  AWS_S3_SECRET: secretAccessKey,
  AWS_REGION: region = 'us-west-2',
} = process.env

if (!accessKeyId) {
  throw new Error('AWS_S3_KEY is required')
}
if (!secretAccessKey) {
  throw new Error('AWS_S3_SECRET is required')
}

@Injectable()
export class AwsS3Service extends AwsService {
  private readonly s3Client: S3Client

  constructor() {
    super()

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
      },
    })
  }

  async uploadFile(
    fileObject: PutObjectCommandInput['Body'],
    bucket: string,
    fileName: string,
    fileType: string,
    options?: UploadOptions,
  ) {
    const filePath = `${bucket}/${slugify(fileName, {
      lower: true,
      trim: true,
    })}`

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

    this.logger.debug(`Getting signed URL for ${filePath}`, {
      Bucket: ASSET_DOMAIN,
      Key: filePath,
      ContentType: fileType,
    })

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
