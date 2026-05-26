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
let GRAFANA_AUTH: string | undefined
let GRAFANA_SM_ACCESS_TOKEN: string | undefined

const getSSMParameter = async (name: string) => {
  const { Parameter } = await ssm.getParameter({
    Name: name,
    WithDecryption: true,
  })

  if (!Parameter?.Value) {
    console.error(`Error: Failed to pull ${name} from SSM`)
    process.exit(1)
  }
  return Parameter.Value
}

type RunOptions = ExecSyncOptions & {
  // When true, a non-zero exit from `cmd` is swallowed: no console.error,
  // no process.exit. Use this for commands whose stderr stream is captured
  // into a file that must stay clean (e.g. `pulumi preview --json` in CI,
  // see the diff handler below).
  silentOnFailure?: boolean
}

const run = (cmd: string, opts?: RunOptions) => {
  const { silentOnFailure, ...execOpts } = opts ?? {}
  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd: __dirname,
      env: {
        ...process.env,
        AWS_REGION,
        PULUMI_CONFIG_PASSPHRASE,
        GRAFANA_AUTH,
        GRAFANA_SM_ACCESS_TOKEN,
      },
      ...execOpts,
    })
  } catch (e) {
    if (silentOnFailure) return
    console.error(`\nCommand failed: ${cmd}`)
    // Caught error has no static type — extracting exit code for process.exit
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    process.exit((e as { status?: number }).status ?? 1)
  }
}

const setupStack = async (env: string) => {
  // env is validated by this includes check — narrowing string to environment literal
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
    run('npm run generate', { cwd: `${__dirname}/..` })
    run('npm run build', { cwd: `${__dirname}/..` })

    run(
      `aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin ${ECR_REGISTRY}`,
    )
    imageUri = `${ECR_REGISTRY}/gp-api:${userInfo().username}-${Date.now()}`
    run(
      `docker build --platform linux/amd64 -t "${imageUri}" -f ./Dockerfile .. --push`,
    )
    console.log('✅  Built and pushed image to ECR')
  }

  PULUMI_CONFIG_PASSPHRASE = await getSSMParameter(
    'pulumi-state-config-passphrase',
  )

  GRAFANA_AUTH = await getSSMParameter('grafana-shared-service-account-token')
  GRAFANA_SM_ACCESS_TOKEN = await getSSMParameter('grafana-sm-access-token')

  // In CI, every setup pulumi command must keep both stdout AND stderr fully
  // silenced. The infrastructure-diffs workflow runs the diff with
  // `> /tmp/preview-$env.json 2>&1`, so any stream a child process inherits
  // ends up in the JSON file and breaks jq parsing. Pulumi setup commands
  // write success/configuration lines (the original culprit, fixed by
  // ignoring stdout) and occasionally backend-state warnings to stderr; both
  // need to go to /dev/null in CI.
  //
  // The trade-off: if a setup command fails in CI we lose pulumi's underlying
  // error message. The `try/catch` in `run()` still surfaces the failed
  // command and exit code via console.error, so the workflow log will still
  // show *that* a command failed, just not pulumi's specific reason. A
  // failed setup is also rare (these are non-mutating reads + idempotent
  // config writes). Worth it to keep CI green.
  const setupStdio: ExecSyncOptions['stdio'] = process.env.CI
    ? ['inherit', 'ignore', 'ignore']
    : 'inherit'

  run('pulumi login s3://goodparty-iac-state', { stdio: setupStdio })
  run(`pulumi stack select ${stack} --create`, { stdio: setupStdio })
  run(`pulumi config set aws:region ${AWS_REGION}`, { stdio: setupStdio })
  run(`pulumi config set environment ${env}`, { stdio: setupStdio })
  run(`pulumi config set imageUri ${imageUri}`, { stdio: setupStdio })
  run('pulumi config set grafana:url https://goodparty.grafana.net', {
    stdio: setupStdio,
  })
  run(
    'pulumi config set grafana:smUrl https://synthetic-monitoring-api-us-east-3.grafana.net',
    { stdio: setupStdio },
  )
  if (env === 'preview') {
    run(`pulumi config set prNumber ${process.env.GITHUB_PR_NUMBER}`, {
      stdio: setupStdio,
    })
  }
  run(`pulumi config set --path aws:defaultTags.tags.Environment ${env}`, {
    stdio: setupStdio,
  })
  run(`pulumi config set --path aws:defaultTags.tags.Project gp-api`, {
    stdio: setupStdio,
  })
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
      // In CI, the `--json` variant is consumed by jq (see
      // .github/workflows/infrastructure-diffs.yml). The workflow redirects
      // with `> file 2>&1`, so any byte we let into stderr lands in the
      // JSON file and breaks jq parsing. Two sources to silence:
      //   1. pulumi's own stderr (progress lines, warnings).
      //   2. our `run()` wrapper's "Command failed: ..." console.error,
      //      which fires when pulumi exits non-zero (and pulumi exits
      //      non-zero whenever the preview surfaces ANY error in
      //      .diagnostics, even though the JSON it emits is well-formed
      //      and complete).
      // The workflow already inspects .diagnostics for errors and prints
      // them in the PR comment (infrastructure-diffs.yml:66), so we're
      // not losing information.
      const isJsonInCi = argv.json && Boolean(process.env.CI)
      run(argv.json ? 'pulumi preview --json' : 'pulumi preview --diff', {
        stdio: isJsonInCi ? ['inherit', 'inherit', 'ignore'] : 'inherit',
        silentOnFailure: isJsonInCi,
      })
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
  .command(
    'refresh <environment>',
    'Refresh the Pulumi stack',
    (yargs) =>
      yargs.positional('environment', {
        describe: 'Target environment',
        choices: ENVIRONMENTS,
        demandOption: true,
      }),
    async (argv) => {
      // We don't need an image URI to refresh, so we'll just use a placeholder
      process.env.IMAGE_URI = 'placeholder'
      await setupStack(argv.environment)
      run('pulumi refresh --diff')
    },
  )
  .demandCommand(1, 'You must specify a command')
  .strict()
  .help()
  .parse()
