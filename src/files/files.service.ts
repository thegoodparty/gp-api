import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { CacheControls } from 'http-constants-ts'
import { AwsS3Service } from 'src/vendors/aws/services/awsS3.service'
import { FileUpload, GenerateSignedUploadUrlArgs } from './files.types'
import { PinoLogger } from 'nestjs-pino'

/**
 * @deprecated This service is being gradually migrated to use S3Service directly.
 * Use S3Service for new features that require flexible bucket/subfolder support.
 * Each feature should create its own controller endpoint for signed URLs with feature-specific logic.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly aws: AwsS3Service,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FilesService.name)
  }

  generateSignedUploadUrl({
    bucket,
    fileName,
    fileType,
  }: GenerateSignedUploadUrlArgs) {
    return this.aws.getSignedS3Url(bucket, fileName, fileType)
  }

  async uploadFile(file: FileUpload, bucket: string, fileName?: string) {
    try {
      return await this.aws.uploadFile(
        file.data,
        bucket,
        fileName ?? file.filename,
        file.mimetype,
        {
          cacheControl: `${CacheControls.MAX_AGE}=${31_536_000}`,
        },
      )
    } catch (e) {
      throw new InternalServerErrorException('Failed to upload', { cause: e })
    }
  }

  async uploadFiles(files: FileUpload[], bucket: string, fileName?: string) {
    try {
      await Promise.all(
        files.map((file) => this.uploadFile(file, bucket, fileName)),
      )
    } catch (e) {
      throw new InternalServerErrorException('Failed to upload', { cause: e })
    }
  }
}
