import * as aws from '@pulumi/aws'

export interface AgentRunInputsBucketConfig {
  environment: 'dev' | 'qa' | 'prod'
}

/**
 * Private bucket for user-supplied files that get fed into agent experiment
 * runs as inputs. First use case: meeting-briefing agenda packets uploaded by
 * candidates from the /briefings page when an automatic agenda isn't available
 * yet.
 *
 * Browser PUTs via presigned URL issued by gp-api; at dispatch time gp-api
 * generates a presigned GET URL with a few-hour TTL and passes it to the agent
 * runner as a PARAMS value. The broker proxies the agent's fetch through its
 * normal http/pdf-fetch path — no broker IAM needed, the presigned URL carries
 * the signature.
 *
 * Lifecycle: indefinite retention on current versions (audit + re-run support).
 * Noncurrent versions expire after 30 days to bound storage cost from frequent
 * re-uploads.
 */
export function createAgentRunInputsBucket({
  environment,
}: AgentRunInputsBucketConfig): {
  bucket: aws.s3.Bucket
} {
  const select = <T>(values: Record<'dev' | 'qa' | 'prod', T>): T =>
    values[environment]

  const bucketName = `gp-agent-run-inputs-${environment}`

  const bucket = new aws.s3.Bucket('agent-run-inputs-bucket', {
    bucket: bucketName,
    forceDestroy: false,
  })

  new aws.s3.BucketPublicAccessBlock('agent-run-inputs-pab', {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  })

  new aws.s3.BucketServerSideEncryptionConfigurationV2(
    'agent-run-inputs-sse',
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

  new aws.s3.BucketVersioningV2('agent-run-inputs-versioning', {
    bucket: bucket.id,
    versioningConfiguration: {
      status: 'Enabled',
    },
  })

  new aws.s3.BucketLifecycleConfigurationV2('agent-run-inputs-lifecycle', {
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
  })

  // Browser PUTs directly to S3 via the presigned URL returned by gp-api.
  // Origins match the annotation-attachments bucket so the cross-bucket
  // policy stays consistent.
  new aws.s3.BucketCorsConfigurationV2('agent-run-inputs-cors', {
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
