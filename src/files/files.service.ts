import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { AwsS3Service } from 'src/aws/services/awsS3.service'
import { CacheControls } from 'http-constants-ts'
import { FileUpload, GenerateSignedUploadUrlArgs } from './files.types'

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name)

  constructor(private readonly aws: AwsS3Service) {}

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
