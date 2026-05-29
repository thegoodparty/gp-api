import * as aws from '@pulumi/aws'

export interface MeetingPipelineBucketConfig {
  environment: 'qa' | 'prod'
}

/**
 * Bucket for the meeting-pipeline data plane. Shared between:
 *  - the external `meeting_pipeline` lambdas/ECS tasks that write briefing
 *    JSON and intermediate artifacts under the `meeting_pipeline/` prefix
 *  - gp-api `TextToSpeechService`, which caches Polly audio under
 *    `speech/synth/` and hands the browser presigned GET URLs
 *
 * The dev bucket (`meeting-pipeline-dev`) was created out-of-band well
 * before this file existed; Pulumi does NOT own it. This component creates
 * the qa/prod buckets so the existing select() in deploy/index.ts has
 * something real to point at in those environments. When the larger
 * meeting-pipeline Terraform stack eventually lands in gp-ai-projects,
 * those buckets can be `terraform import`'d into that module's state and
 * this component retired.
 */
export function createMeetingPipelineBucket({
  environment,
}: MeetingPipelineBucketConfig): {
  bucket: aws.s3.Bucket
} {
  const bucketName = `meeting-pipeline-${environment}`

  const bucket = new aws.s3.Bucket('meeting-pipeline-bucket', {
    bucket: bucketName,
    forceDestroy: false,
  })

  new aws.s3.BucketPublicAccessBlock('meeting-pipeline-pab', {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  })

  new aws.s3.BucketServerSideEncryptionConfigurationV2(
    'meeting-pipeline-sse',
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

  return { bucket }
}
