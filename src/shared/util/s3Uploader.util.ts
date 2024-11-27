import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { InternalServerErrorException } from '@nestjs/common';

interface S3Data {
  Key: string;
  Body?: Buffer | string;
  ContentEncoding?: string;
  ContentType?: string;
  CacheControl?: string;
}

export async function s3Uploader(data: S3Data, bucketName: string, base64?: string, isBuffer?: boolean) {
  const s3Key = process.env.S3_KEY;
  const s3Secret = process.env.S3_SECRET;

  if (!s3Key || !s3Secret) {
    throw new InternalServerErrorException(
      'S3_KEY and S3_SECRET env variables must be set',
    );
  }

  const s3Client = new S3Client({
    region: 'us-west-2',
    credentials: {
      accessKeyId: s3Key,
      secretAccessKey: s3Secret,
    },
  });

  if (!data.Body && base64) {
    data.Body = Buffer.from(base64, 'base64');
  }
  if (isBuffer) {
    if (Buffer.isBuffer(data.Body)) {
      data.Body = JSON.parse(data.Body.toString());
    } else if (typeof data.Body === 'string') {
      data.Body = JSON.parse(data.Body);
    }
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: data.Key,
    Body: data.Body,
    ContentEncoding: data.ContentEncoding,
    ContentType: data.ContentType,
    ACL: 'public-read',
  });

  const response = await s3Client.send(command);
  console.log('response', response);
}