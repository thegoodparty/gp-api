import { execSync } from 'child_process'
import { writeFileSync } from 'fs'

interface PulumiStack {
  name: string
}

interface GitHubPR {
  number: number
  state: string
}

const getPreviewPulumiStacks = () => {
  const output = execSync('pulumi stack ls --json', {
    encoding: 'utf-8',
    stdio: 'pipe',
    cwd: `${__dirname}/../deploy`,
  })
  const stacks = JSON.parse(output) as PulumiStack[]
  return stacks
    .map((s) => s.name)
    .filter((name) => name.startsWith('gp-api-pr-'))
}

const extractPrNumber = (stackName: string) => {
  const match = stackName.match(/^gp-api-pr-(\d+)$/)
  if (!match) {
    throw new Error(`Could not extract PR number from stack name: ${stackName}`)
  }
  return parseInt(match[1])
}

const getOpenPrNumbers = async () => {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required')
  }

  const response = await fetch(
    // For now, just fetch the first page. We're a long way from having >100 open PRs
    'https://api.github.com/repos/thegoodparty/gp-api/pulls?state=open&per_page=100',
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    )
  }

  const prs = (await response.json()) as GitHubPR[]

  return prs.map((pr) => pr.number)
}

const outfile = process.argv[2]
if (!outfile) {
  throw new Error('Output file is required')
}

const main = async () => {
  const prStacks = getPreviewPulumiStacks()
  console.log(`Found ${prStacks.length} PR stacks`)

  if (prStacks.length === 0) {
    writeFileSync(outfile, JSON.stringify([]))
    return
  }

  // Get open PRs from GitHub
  const openPrs = await getOpenPrNumbers()
  console.log(`Found ${openPrs.length} open PRs`)

  const staleStacks = prStacks.filter(
    (stack) => !openPrs.includes(extractPrNumber(stack)),
  )

  console.log('Stale stacks:')
  console.log(staleStacks.join('\n'))

  writeFileSync(outfile, JSON.stringify(staleStacks))
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
