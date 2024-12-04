import { S3Client, DeleteObjectCommand, DeleteObjectCommandOutput } from '@aws-sdk/client-s3';
import { InternalServerErrorException } from '@nestjs/common';
import { Logger } from '@nestjs/common';

export async function s3DeleteFile(bucketName: string, path: string): Promise<DeleteObjectCommandOutput> {
  const logger = new Logger('s3DeleteFile');
  const s3Key = process.env.S3_KEY;
  const s3Secret = process.env.S3_SECRET;
  const assetsBase = process.env.ASSETS_BASE;

  if (!s3Key || !s3Secret) {
    throw new InternalServerErrorException('AWS S3 credentials are missing');
  }

  const s3Bucket = new S3Client({
    region: 'us-west-2',
    credentials: {
      accessKeyId: s3Key,
      secretAccessKey: s3Secret,
    },
  });

  const deleteObjectParams = {
    Bucket: bucketName,
    Key: path,
  };

  const command = new DeleteObjectCommand(deleteObjectParams);

  try {
    const response = await s3Bucket.send(command);
    return response;
  } catch (error) {
    if (error instanceof Error) {
      logger.error('Error occured while trying to delete object from S3', error.stack)
    } else {
      logger.error('Unknown error occured while trying to delete object from S3', error);
    }
    throw new InternalServerErrorException('Failed to delete object from S3');
  }
}