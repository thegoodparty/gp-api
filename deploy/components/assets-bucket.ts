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

  // Enable public access blocks for ALL environments to prevent direct S3 access
  // Access should only be allowed through CloudFront OAC
  new aws.s3.BucketPublicAccessBlock('assetsBucketPublicAccessBlock', {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  })

  // NOTE: Bucket policy allowing CloudFront OAC access is created in assets-router.ts
  // for dev/qa environments. For prod, the CloudFront distribution ARN needs to be
  // provided separately (see PROD_CLOUDFRONT_DISTRIBUTION_ARN below).

  // For prod environment, we need to create the CloudFront-only bucket policy here
  // since it doesn't go through assets-router.ts
  if (environment === 'prod') {
    const prodCloudfrontDistributionArn =
      'arn:aws:cloudfront::333022194791:distribution/E2LRA7IV6F5YST'

    new aws.s3.BucketPolicy('assetsOacBucketPolicyProd', {
      bucket: bucket.id,
      policy: aws.iam.getPolicyDocumentOutput({
        statements: [
          {
            principals: [
              {
                type: 'Service',
                identifiers: ['cloudfront.amazonaws.com'],
              },
            ],
            actions: ['s3:GetObject'],
            resources: [pulumi.interpolate`${bucket.arn}/*`],
            conditions: [
              {
                test: 'StringEquals',
                variable: 'AWS:SourceArn',
                values: [prodCloudfrontDistributionArn],
              },
            ],
          },
        ],
      }).json,
    })
  }

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
