import { Injectable } from '@nestjs/common'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GenerateSignedUploadUrlArgs } from '../users/users.types'

const {
  AWS_ACCESS_KEY_ID: accessKeyId,
  AWS_SECRET_ACCESS_KEY: secretAccessKey,
  AWS_REGION: region = 'us-west-2',
} = process.env

if (!accessKeyId) {
  throw new Error('AWS_ACCESS_KEY_ID is required')
}
if (!secretAccessKey) {
  throw new Error('AWS_SECRET_ACCESS_KEY is required')
}

@Injectable()
export class AwsService {
  private readonly s3Client: S3Client
  constructor() {
    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
      },
    })
  }

  async getSignedS3Url(bucketPath: string, filePath: string, fileType: string) {
    return await getSignedUrl(
      this.s3Client,
      new PutObjectCommand({
        Bucket: bucketPath,
        Key: filePath,
        ContentType: fileType,
      }),
      { expiresIn: 3600 },
    )
  }

  async generateSignedUploadUrl({
    bucket,
    fileName,
    fileType,
  }: GenerateSignedUploadUrlArgs) {
    const bucketPath = bucket.includes('/') ? bucket.split('/')[0] : bucket
    const filePath = bucket.includes('/')
      ? `${bucket.split('/')[1]}/${fileName}`
      : fileName
    return await this.getSignedS3Url(bucketPath, filePath, fileType)
  }
}
