import * as aws from '@pulumi/aws'

export interface AnnotationAttachmentsBucketConfig {
  environment: 'dev' | 'qa' | 'prod'
}

/**
 * Private bucket for user-uploaded note attachments (camera shots, agenda
 * packets, etc.). Reads/writes go through gp-api: presigned PUT for upload,
 * server-side GetObject for OCR and any future retrieval, server-side
 * DeleteObject for cleanup. The bucket itself blocks all public access — the
 * presigned URLs are how the browser gets in.
 *
 * CORS is needed because the browser PUTs directly to S3 using the
 * presigned URL returned by `POST /v1/annotations/:id/note/attachments/presign`.
 */
export function createAnnotationAttachmentsBucket({
  environment,
}: AnnotationAttachmentsBucketConfig): {
  bucket: aws.s3.Bucket
} {
  const select = <T>(values: Record<'dev' | 'qa' | 'prod', T>): T =>
    values[environment]

  // Names follow the env (dev/qa/prod), same as assets-bucket. The dev bucket
  // is being adopted from one created manually in the console; Pulumi takes
  // it over on first deploy (one-time `pulumi import` if the create errors
  // out as "already owned"). QA/prod are created fresh on their first deploy.
  const bucketName = `annotation-attachments-${environment}`

  const bucket = new aws.s3.Bucket('annotation-attachments-bucket', {
    bucket: bucketName,
    forceDestroy: false,
  })

  new aws.s3.BucketPublicAccessBlock('annotation-attachments-pab', {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  })

  new aws.s3.BucketServerSideEncryptionConfigurationV2(
    'annotation-attachments-sse',
    {
      bucket: bucket.id,
      rules: [
        {
          applyServerSideEncryptionByDefault: {
            sseAlgorithm: 'AES256',
          },
        },
      ],
    },
  )

  new aws.s3.BucketVersioningV2('annotation-attachments-versioning', {
    bucket: bucket.id,
    versioningConfiguration: {
      status: 'Enabled',
    },
  })

  // Decision 4 of the intake plan: keep originals + OCR text indefinitely.
  // No object expiry — just bound noncurrent-version storage cost.
  new aws.s3.BucketLifecycleConfigurationV2(
    'annotation-attachments-lifecycle',
    {
      bucket: bucket.id,
      rules: [
        {
          id: 'expire-noncurrent-versions',
          status: 'Enabled',
          filter: {},
          noncurrentVersionExpiration: {
            noncurrentDays: 30,
          },
        },
      ],
    },
  )

  // Allow the browser to PUT directly via presigned URL. Same origins as the
  // existing assets bucket — keeps the cross-bucket policy consistent.
  new aws.s3.BucketCorsConfigurationV2('annotation-attachments-cors', {
    bucket: bucket.id,
    corsRules: [
      {
        allowedHeaders: ['*'],
        allowedMethods: ['PUT'],
        allowedOrigins: select({
          dev: [
            'http://localhost:4000',
            'https://dev.goodparty.org',
            'https://qa.goodparty.org',
          ],
          qa: [
            'http://localhost:4000',
            'https://gp-ui-git-qa-good-party.vercel.app',
            'https://qa.goodparty.org',
          ],
          prod: ['https://goodparty.org'],
        }),
        exposeHeaders: ['ETag'],
        maxAgeSeconds: 3600,
      },
    ],
  })

  return { bucket }
}
