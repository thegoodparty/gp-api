import { CodegenConfig } from '@graphql-codegen/cli'
import { Headers, MimeTypes } from 'http-constants-ts'
import 'dotenv/config'

const BALLOT_READY_KEY = process.env.BALLOT_READY_KEY

if (!BALLOT_READY_KEY) {
  throw new Error('Please set BALLOT_READY_KEY in your .env')
}

const headers = {
  [Headers.AUTHORIZATION]: `Bearer ${BALLOT_READY_KEY}`,
  [Headers.CONTENT_TYPE]: MimeTypes.APPLICATION_JSON,
}

const codegenConfig: CodegenConfig = {
  schema: [
    {
      'https://bpi.civicengine.com/graphql': {
        headers,
      },
    },
  ],
  generates: {
    'src/generated/graphql.types.ts': {
      plugins: ['typescript', 'typescript-operations', 'typescript-resolvers'],
    },
  },
  config: {
    namingConvention: 'keep',
    maybeValue: 'T | null',
  },
}

export default codegenConfig
