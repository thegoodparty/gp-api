const PEERLY_API_BASE_URL = process.env.PEERLY_API_BASE_URL
const PEERLY_ACCOUNT_NUMBER = process.env.PEERLY_ACCOUNT_NUMBER

if (!PEERLY_API_BASE_URL) {
  throw new Error('Please set PEERLY_API_BASE_URL in your .env')
}

if (!PEERLY_ACCOUNT_NUMBER) {
  throw new Error('Please set PEERLY_ACCOUNT_NUMBER in your .env')
}

export function getPeerlyJobUrl(jobId: string): string {
  const peerlyWebUrl = PEERLY_API_BASE_URL!.replace('/api', '')
  return `${peerlyWebUrl}/${PEERLY_ACCOUNT_NUMBER}/p2p/${jobId}`
}
