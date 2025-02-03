import { CodegenConfig } from '@graphql-codegen/cli'
import 'dotenv/config'

const BALLOT_READY_KEY = process.env.BALLOT_READY_KEY

if (!BALLOT_READY_KEY) {
  throw new Error('Please set BALLOT_READY_KEY in your .env')
}

const codegenConfig: CodegenConfig = {
  schema: [
    {
      'https://bpi.civicengine.com/graphql': {
        headers: {
          Authorization: `Bearer ${BALLOT_READY_KEY}`,
          'Content-Type': 'application/json',
        },
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
