export const queueConfig = {
  name: process.env.SQS_QUEUE || '',
  queueUrl: process.env.SQS_QUEUE_URL || '',
  region: process.env.AWS_REGION || '',
}
