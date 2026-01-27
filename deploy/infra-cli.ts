import { execSync, ExecSyncOptions } from 'node:child_process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { SSM } from '@aws-sdk/client-ssm'
import { userInfo } from 'node:os'

const ECR_REGISTRY = '333022194791.dkr.ecr.us-west-2.amazonaws.com'

const ENVIRONMENTS = ['preview', 'dev', 'qa', 'prod'] as const

const AWS_REGION = 'us-west-2'

const ssm = new SSM({ region: AWS_REGION })

let PULUMI_CONFIG_PASSPHRASE: string | undefined

const run = (cmd: string, opts?: ExecSyncOptions) => {
  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd: __dirname,
      env: { ...process.env, AWS_REGION, PULUMI_CONFIG_PASSPHRASE },
      ...opts,
    })
  } catch (e) {
    console.error(`\nCommand failed: ${cmd}`)
    process.exit((e as { status?: number }).status ?? 1)
  }
}

const setupStack = async (env: string) => {
  if (!ENVIRONMENTS.includes(env as (typeof ENVIRONMENTS)[number])) {
    console.error(
      `Invalid environment: ${env}. Must be one of: ${ENVIRONMENTS.join(', ')}`,
    )
    process.exit(1)
  }

  let stack: string
  if (env === 'preview') {
    const prNumber = process.env.GITHUB_PR_NUMBER
    if (!prNumber) {
      console.error(
        'Error: GITHUB_PR_NUMBER environment variable is required for preview environment',
      )
      process.exit(1)
    }
    stack = `organization/gp-api/gp-api-pr-${prNumber}`
  } else {
    stack = `organization/gp-api/gp-api-${env}`
  }

  try {
    execSync('aws sts get-caller-identity', { stdio: 'pipe' })
  } catch {
    console.error(
      'It looks like you are not authenticated via the AWS CLI. Please authenticate and try again.',
    )
    process.exit(1)
  }

  let imageUri = process.env.IMAGE_URI
  if (!imageUri) {
    console.warn(
      'IMAGE_URI environment variable is not set, building image locally',
    )
    run(
      `aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin ${ECR_REGISTRY}`,
    )
    imageUri = `${ECR_REGISTRY}/gp-api:${userInfo().username}-${Date.now()}`
    run(
      `docker build --platform linux/amd64 --build-arg CACHEBUST=${process.env.GITHUB_SHA} -t "${imageUri}" -f ./Dockerfile .. --push`,
    )
    console.log('✅  Built and pushed image to ECR')
  }

  const { Parameter } = await ssm.getParameter({
    Name: 'pulumi-state-config-passphrase',
    WithDecryption: true,
  })
  if (!Parameter?.Value) {
    console.error(
      'Error: Failed to pull pulumi state config passphrase from SSM',
    )
    process.exit(1)
  }

  PULUMI_CONFIG_PASSPHRASE = Parameter.Value

  run('pulumi login s3://goodparty-iac-state', {
    // Ignore stdio -- we need the output to be pure JSON for diffs in CI
    stdio: process.env.CI ? ['inherit', 'ignore', 'inherit'] : 'inherit',
  })
  run(`pulumi stack select ${stack} --create`)
  run(`pulumi config set aws:region ${AWS_REGION}`)
  run(`pulumi config set environment ${env}`)
  run(`pulumi config set imageUri ${imageUri}`)
  if (env === 'preview') {
    run(`pulumi config set prNumber ${process.env.GITHUB_PR_NUMBER}`)
  }
  run(`pulumi config set --path aws:defaultTags.tags.Environment ${env}`)
  run(`pulumi config set --path aws:defaultTags.tags.Project gp-api`)
}

yargs(hideBin(process.argv))
  .scriptName('infra')
  .usage('$0 <command> <environment>')
  .command(
    'diff <environment>',
    'Show infrastructure changes without deploying',
    (yargs) =>
      yargs
        .positional('environment', {
          describe: 'Target environment',
          choices: ENVIRONMENTS,
          demandOption: true,
        })
        .option('json', {
          describe: 'Output as JSON',
          type: 'boolean',
          default: false,
        }),
    async (argv) => {
      await setupStack(argv.environment)
      run(argv.json ? 'pulumi preview --json' : 'pulumi preview --diff')
    },
  )
  .command(
    'deploy <environment>',
    'Deploy infrastructure changes',
    (yargs) =>
      yargs.positional('environment', {
        describe: 'Target environment',
        choices: ENVIRONMENTS,
        demandOption: true,
      }),
    async (argv) => {
      await setupStack(argv.environment)
      if (process.env.CI) {
        run('pulumi up --diff --yes')
      } else {
        run('pulumi up --diff')
      }
    },
  )
  .demandCommand(1, 'You must specify a command')
  .strict()
  .help()
  .parse()
