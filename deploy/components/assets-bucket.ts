import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

export interface AssetsBucketConfig {
  environment: 'dev' | 'qa' | 'prod'
}

export function createAssetsBucket({ environment }: AssetsBucketConfig): {
  bucket: aws.s3.BucketV2
  bucketRegionalDomainName: pulumi.Output<string>
} {
  const select = <T>(values: Record<'dev' | 'qa' | 'prod', T>): T =>
    values[environment]

  const bucketName = select({
    dev: 'assets-dev.goodparty.org',
    qa: 'assets-qa.goodparty.org',
    prod: 'assets.goodparty.org',
  })

  const bucket = new aws.s3.BucketV2('assetsBucket', {
    bucket: bucketName,
    forceDestroy: false,
  })

  // Block public bucket policies but allow per-object ACLs for now.
  // Legacy AwsS3Service sets ACL: public_read on uploads -- once that code is
  // migrated to the new S3Service (no ACL), flip these back to true.
  new aws.s3.BucketPublicAccessBlock('assetsBucketPublicAccessBlock', {
    bucket: bucket.id,
    blockPublicAcls: false,
    blockPublicPolicy: true,
    ignorePublicAcls: false,
    restrictPublicBuckets: true,
  })

  // Bucket policy allowing CloudFront OAC access is created in assets-router.ts
  // for all environments, scoped to the CloudFront distribution it manages.

  new aws.s3.BucketCorsConfigurationV2('assetsBucketCors', {
    bucket: bucket.id,
    corsRules: [
      {
        allowedHeaders: ['*'],
        allowedMethods: ['GET', 'POST', 'PUT'],
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
      },
    ],
  })

  return {
    bucket,
    bucketRegionalDomainName: bucket.bucketRegionalDomainName,
  }
}
