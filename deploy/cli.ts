import { execSync } from 'node:child_process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const ENVIRONMENTS = ['preview', 'dev', 'qa', 'prod'] as const

const run = (cmd: string) => {
  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd: __dirname,
      env: { ...process.env, AWS_REGION: 'us-west-2' },
    })
  } catch (e) {
    console.error(`\nCommand failed: ${cmd}`)
    process.exit((e as { status?: number }).status ?? 1)
  }
}

const setupStack = (env: string) => {
  if (!ENVIRONMENTS.includes(env as (typeof ENVIRONMENTS)[number])) {
    console.error(
      `Invalid environment: ${env}. Must be one of: ${ENVIRONMENTS.join(', ')}`,
    )
    process.exit(1)
  }

  const imageUri = process.env.IMAGE_URI
  if (!imageUri) {
    console.error('Error: IMAGE_URI environment variable is required')
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

  run('pulumi login s3://goodparty-iac-state')
  run(`pulumi stack select ${stack} --create`)
  run('pulumi config set aws:region us-west-2')
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
      yargs.positional('environment', {
        describe: 'Target environment',
        choices: ENVIRONMENTS,
        demandOption: true,
      }),
    (argv) => {
      setupStack(argv.environment)
      run('pulumi preview --diff')
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
    (argv) => {
      setupStack(argv.environment)
      run(process.env.CI ? 'pulumi up --yes' : 'pulumi up')
    },
  )
  .demandCommand(1, 'You must specify a command')
  .strict()
  .help()
  .parse()
