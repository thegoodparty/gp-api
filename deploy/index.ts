import * as pulumi from '@pulumi/pulumi'

const config = new pulumi.Config()

if (config.getBoolean('isPreview')) {
  module.exports = require('./preview')
} else {
  module.exports = require('./main')
}
