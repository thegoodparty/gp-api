import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

export interface AssetsBucketConfig {
  environment: 'dev' | 'qa' | 'prod'
}

export async function createAssetsBucket({ environment }: AssetsBucketConfig) {
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

  if (environment !== 'prod') {
    new aws.s3.BucketPublicAccessBlock('assetsBucketPublicAccessBlock', {
      bucket: bucket.id,
      blockPublicAcls: false,
      blockPublicPolicy: false,
      ignorePublicAcls: false,
      restrictPublicBuckets: false,
    })
  }

  new aws.s3.BucketPolicy('assetsBucketPolicy', {
    bucket: bucket.id,
    policy: aws.iam.getPolicyDocumentOutput({
      statements: [
        {
          principals: [
            {
              type: '*',
              identifiers: ['*'],
            },
          ],
          actions: ['s3:GetObject'],
          resources: [pulumi.interpolate`${bucket.arn}/*`],
        },
      ],
    }).json,
  })

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
    bucketName,
    bucketRegionalDomainName: bucket.bucketRegionalDomainName,
  }
}
