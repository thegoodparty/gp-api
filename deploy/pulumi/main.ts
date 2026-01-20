import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

const stack = pulumi.getStack()

// This is just a placeholder resource to confirm the deployment works.
new aws.s3.Bucket('test-bucket', {
  bucket: `${stack}-pulumi-test-bucket`,
  tags: { Stack: stack },
})

// TODO: start migrating resources over from SST.
