import * as pulumi from '@pulumi/pulumi'

const config = new pulumi.Config()

if (config.getBoolean('isPreview')) {
  require('./preview')
} else {
  require('./main')
}
