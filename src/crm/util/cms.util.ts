export const formatDateForCRM = (date: string | number | undefined | null) => {
  if (!date) return undefined

  if (typeof date === 'string') {
    const trimmedDate = date.trim()
    if (!trimmedDate) return undefined

    const dateObj = new Date(trimmedDate)
    if (isNaN(dateObj.getTime())) return undefined

    // Set to start of day in UTC
    const utcStartOfDay = new Date(
      Date.UTC(
        dateObj.getUTCFullYear(),
        dateObj.getUTCMonth(),
        dateObj.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    )
    return utcStartOfDay.getTime().toString()
  }

  const dateObj = new Date(date)
  if (isNaN(dateObj.getTime())) return undefined

  // Set to start of day in UTC
  const utcStartOfDay = new Date(
    Date.UTC(
      dateObj.getUTCFullYear(),
      dateObj.getUTCMonth(),
      dateObj.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  )
  return utcStartOfDay.getTime().toString()
}

// Some Hubspot keys couldn't be changed, see:
// https://goodpartyorg.slack.com/archives/C01AEH4TEBX/p1716572940340399?thread_ts=1716563708.979759&cid=C01AEH4TEBX
const KEEP_SNAKECASE = ['p2vStatus', 'p2vCompleteDate', 'winNumber']
const P2V_FIELDS = [
  { key: 'totalRegisteredVoters', hubSpotKey: 'totalregisteredvoters' },
  { key: 'republicans', hubSpotKey: 'republicans' },
  { key: 'democrats', hubSpotKey: 'democrats' },
  { key: 'indies', hubSpotKey: 'indies' },
  { key: 'asians', hubSpotKey: 'asian' },
  { key: 'africanAmerican', hubSpotKey: 'africanamerican' },
  { key: 'hispanic', hubSpotKey: 'hispanic' },
  { key: 'white', hubSpotKey: 'white' },
  { key: 'likelyVotes', hubSpotKey: 'likely_voters' },
  { key: 'projectedTurnout', hubSpotKey: 'projectedturnout' },
  { key: 'voterContactGoal', hubSpotKey: 'votercontactgoal' },
  { key: 'voterProjection', hubSpotKey: 'voterprojection' },
  { key: 'men', hubSpotKey: 'men' },
  { key: 'women', hubSpotKey: 'women' },
]
export const getCrmP2VValues = (p2vData?: PrismaJson.PathToVictoryData) => {
  if (!p2vData) return {}

  const p2v: Record<string, string> = Object.keys(p2vData)
    .filter((key) => KEEP_SNAKECASE.includes(key))
    .reduce(
      (result, key) => ({
        ...result,
        [key.toLowerCase()]: `${p2vData[key]}`,
      }),
      {},
    )
  delete p2v.p2vStatus
  delete p2v.p2vCompleteDate
  delete p2v.winNumber
  delete p2v.winnumber

  // add P2V_FIELDS
  P2V_FIELDS.forEach(({ key, hubSpotKey }) => {
    if (p2vData[key] !== undefined) {
      p2v[hubSpotKey] = `${p2vData[key]}`
    }
  })
  if (p2v.votercontactgoal) {
    p2v.votercontactgoal = `${parseInt(p2v.votercontactgoal as string)}`
  }
  return p2v
}
