import { format } from 'date-fns'
import { RaceContext } from '../types/electionApi.types'

const htmlEscape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const NOT_AVAILABLE = 'not available'

const orNotAvailable = (value: string | number | null | undefined): string => {
  if (value == null) return NOT_AVAILABLE
  if (typeof value === 'number') return String(value)
  const trimmed = value.trim()
  return trimmed.length === 0 ? NOT_AVAILABLE : trimmed
}

export type PromptVariables = {
  today: string
  user_full_name: string
  candidate_office: string
  official_office_name: string
  office_level: string
  office_type: string
  state: string
  user_party_affiliation: string
  general_election_date: string
  primary_election_date: string
  number_of_seats: string
  projected_turnout: string
  win_number_estimate: string
  contacts_needed_estimate: string
  candidates: string
  // Stage 2 prompts get this from stage 1's output. Stage 1 has it undefined.
  searchResults?: string
}

// Strip nullable keys (party, websiteUrl) when null so the LLM doesn't see
// "party": null noise. isIncumbent stays as a real tri-state because
// null carries meaning ("incumbent status unknown") that the opposition
// research prompt cares about.
const serializeCandidates = (candidates: RaceContext['candidates']): string =>
  JSON.stringify(
    candidates.map((c) => ({
      fullName: c.fullName,
      isUser: c.isUser,
      isIncumbent: c.isIncumbent,
      ...(c.party != null && c.party.length > 0 && { party: c.party }),
      ...(c.websiteUrl && { websiteUrl: c.websiteUrl }),
    })),
  )

export const buildPromptVariables = (
  ctx: RaceContext,
  today: Date = new Date(),
): PromptVariables => ({
  today: format(today, 'yyyy-MM-dd'),
  user_full_name: orNotAvailable(ctx.userFullName),
  candidate_office: orNotAvailable(ctx.candidateOffice),
  official_office_name: orNotAvailable(ctx.officialOfficeName),
  office_level: orNotAvailable(ctx.officeLevel),
  office_type: orNotAvailable(ctx.officeType),
  state: orNotAvailable(ctx.state),
  user_party_affiliation: orNotAvailable(ctx.userPartyAffiliation),
  general_election_date: orNotAvailable(ctx.generalElectionDate),
  primary_election_date: orNotAvailable(ctx.primaryElectionDate),
  number_of_seats: orNotAvailable(ctx.numberOfSeats),
  projected_turnout: orNotAvailable(ctx.projectedTurnout),
  win_number_estimate: orNotAvailable(ctx.winNumberEstimate),
  contacts_needed_estimate: orNotAvailable(ctx.contactsNeededEstimate),
  candidates: serializeCandidates(ctx.candidates),
})

export const renderPrompt = (
  template: string,
  variables: Record<string, string | undefined>,
): string =>
  Object.entries(variables).reduce((rendered, [key, value]) => {
    if (value === undefined) return rendered
    const escapedValue = htmlEscape(value).replace(/\$/g, '$$$$')
    return rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), escapedValue)
  }, template)

// Block shared across all three section prompts. Editing here applies to all.
// Any field that is missing in the source data is substituted as the literal
// string "not available" by buildPromptVariables.
const CONTEXT_BLOCK = `Use the following campaign context:
- Current date: {{today}}
- Candidate name: {{user_full_name}}
- Office sought: Pick whichever is the most descriptive, between {{candidate_office}} and {{official_office_name}}
- Office type: {{office_type}}
- Office level: {{office_level}}
- Number of seats: {{number_of_seats}}
- General election date: {{general_election_date}}
- Primary election date: {{primary_election_date}}
- State: {{state}}
- The party affiliation of the candidate: {{user_party_affiliation}}. If {{user_party_affiliation}} is "Nonpartisan", that means that the election itself is a nonpartisan contest.
- Projected votes needed to win: {{win_number_estimate}}
- Projected voter turnout: {{projected_turnout}}
- Voter contact goal: {{contacts_needed_estimate}}
- Candidates in this race (includes the candidate you're addressing): {{candidates}}
- Opponents: Anyone in the candidates list above other than the candidate you're addressing ({{user_full_name}}). You can also search online to find information about opponents, but first consult the provided dataset. Double check whether or not the opponent is competing in a different partisan primary from the candidate you're addressing, and if they are, flag that.

Any field above shown as "not available" was missing in the source data; treat it as unknown.`

const GLOSSARY_BLOCK = `# GLOSSARY
- registered voters: The total pool of voters eligible to cast a ballot for a race, pulled from the latest voter file.
- projected voter turnout: The estimated number of registered voters expected to cast a ballot in this specific election, derived from a turnout model applied to recent comparable cycles. Historically our projections have been +/- 1.5% of actual voter turnout.
- projected votes needed to win: The vote total at which a candidate would win the seat with certainty given the modeled voter turnout. Calculated as 50% + 1 of the projected voter turnout.
- targeted voter contact goal: The total number of contacts sent to voters that the campaign aims to deliver. Industry rule of thumb is 5× the projected votes needed to win.
- voter contact: A contact attempt that reaches an intended voter via a channel capable of conveying the message (delivered text, answered call, in-person conversation).
- likely votes: The estimated number of votes you are on track to receive based on voter contacts completed to date. Calculated by counting 1 likely vote for every 5 voter contacts made.`

const COMMON_CONSTRAINTS = `- Write in plain, direct U.S. English. No em dashes. No jargon.
- Bullet points should be 1–3 sentences each — not fragments, not essays.
- Produce ONLY the markdown section above. No title page, no intro, no summary after.
- ALWAYS prefer using language contained in the glossary, do not create synonyms for this language.
- Do NOT refer to the candidate by their name, instead replace their name with "you"
- Prefer numbers instead of words, e.g: don't say "you need half", say "you need 50% + 1", and don't say "five times the projected voter turnout", say "5 times the projected voter turnout"
- Prioritize knowledge of local election rules above jargon in this document. e.g. be mindful that North Dakota does not have voter registration, Connecticut does not have counties.
- For each reference, check to verify that the URL source returns a 200 status code; IF the URL does NOT return status code == 200 THEN discard the citation and find another source.`

const SOURCING_PREAMBLE = `For every claim you make, provide a source with a link (but make it compact, e.g. Wikipedia-style), and make sure the link points to the exact claim you're citing. Lean towards including official government sources, or those of well-reputed data providers like universities or major news outlets. Claims that come from the provided dataset should be cited as "GoodParty.org Data".

The angle should be strategic risks and strategic opportunities. Facts and figures are good, but you are not just here to info dump. They should be shared to advance the goal of helping a candidate understand what they need to do in the race, and why.`

export const OPPORTUNITIES_SEARCH_PROMPT = `You are a campaign strategist writing part of a campaign plan for GoodParty.org. Your job is to produce the Opportunities section. Follow the specified format closely, and don't include a preamble or closing remarks.

${SOURCING_PREAMBLE}

${CONTEXT_BLOCK}

---
# TASK
Write an Opportunities section in this exact markdown structure:
---
# OUTPUT FORMAT
### Opportunities
- [Opportunity tied to a specific data point or structural advantage, e.g., is the win number especially low, is it an open seat without a strong incumbent running, is the number of opponents small compared to the number of seats, is there a lot of lead time before the election]
- [Second opportunity]
- [Third opportunity]
---
# CONSTRAINTS
${COMMON_CONSTRAINTS}
- Every opportunity should be specific to this race and these numbers, not generic campaign advice.

---
${GLOSSARY_BLOCK}`

export const OPPORTUNITIES_STRUCTURED_PROMPT = `The text below is the Opportunities section of a campaign plan, written as markdown. Extract every bullet point from under the "### Opportunities" heading (up to 3) and return them as a JSON array of strings, preserving inline citations verbatim. Drop the leading "- " bullet marker. Do not summarize or rewrite — preserve each bullet word-for-word.

MARKDOWN:
{{searchResults}}

Return a JSON object matching the schema.`

export const CHALLENGES_SEARCH_PROMPT = `You are a campaign strategist writing part of a campaign plan for GoodParty.org. Your job is to produce the Challenges section. Follow the specified format closely, and don't include a preamble or closing remarks.

${SOURCING_PREAMBLE}

${CONTEXT_BLOCK}

---
# TASK
Write a Challenges section in this exact markdown structure:
---
# OUTPUT FORMAT
### Challenges
- [Challenge grounded in the race structure, e.g., vote-splitting risk, facing an incumbent with strong party backing, is the election very soon leaving little time for outreach]
- [Second challenge]
- [Third challenge]
---
# CONSTRAINTS
${COMMON_CONSTRAINTS}
- Every challenge should be specific to this race and these numbers, not generic campaign advice.

---
${GLOSSARY_BLOCK}`

export const CHALLENGES_STRUCTURED_PROMPT = `The text below is the Challenges section of a campaign plan, written as markdown. Extract every bullet point from under the "### Challenges" heading (up to 3) and return them as a JSON array of strings, preserving inline citations verbatim. Drop the leading "- " bullet marker. Do not summarize or rewrite — preserve each bullet word-for-word.

MARKDOWN:
{{searchResults}}

Return a JSON object matching the schema.`

export const OPPOSITION_RESEARCH_SEARCH_PROMPT = `You are a campaign strategist writing part of a campaign plan for GoodParty.org. Your job is to produce the Opposition Research section. Follow the specified format closely, and don't include a preamble or closing remarks.

${SOURCING_PREAMBLE}

${CONTEXT_BLOCK}

---
# TASK
Write an Opposition Research section in this exact markdown structure:
---
# OUTPUT FORMAT
### Opposition Research
Conduct some research on the opponents, using the list of opponents you generated. Remember to prioritize information about the opponents you know about from the data, but you should also use web search to try to surface the names of more opponents who are running for {{candidate_office}} in {{state}} on {{general_election_date}}. Be certain not to include the name of the candidate you're addressing in the list of opponents!

For each opponent found, produce the following structure:
- [Opponent full name]
  - Party affiliation: [party or "Nonpartisan" or "Unknown"]
  - Incumbent: [Yes / No / Unknown]
  - Political summary: [2–3 sentence summary of their known positions, background, or public profile — based only on what you find]
    - [Key position or background fact 1]
    - [Key position or background fact 2]
    - [Key position or background fact 3, if available]
  - Websites found:
    - [URL 1, e.g. campaign website]
    - [URL 2, e.g. a Facebook account]
    - [URL 3, e.g. an Instagram account]
    - ... (include all found)
If no opponent information is found for a given candidate, write: "No public information found as of [today's date]. You should conduct local research."
---
# CONSTRAINTS
${COMMON_CONSTRAINTS}
- Opposition research must be grounded in what web search actually returns. Do not fabricate names, affiliations, or URLs.

---
${GLOSSARY_BLOCK}`

export const OPPOSITION_RESEARCH_STRUCTURED_PROMPT = `The text below is the Opposition Research section of a campaign plan, written as markdown. Extract each opponent into the JSON schema below.

Rules:
- The schema fields use snake_case (full_name, party_affiliation, political_summary, key_facts).
- "incumbent": true if the markdown says Yes, false for No, null for Unknown.
- "party_affiliation": preserve the markdown value (a party name, "Nonpartisan", or "Unknown").
- "political_summary": copy the political-summary sentence(s) verbatim.
- "key_facts": copy the indented sub-bullets verbatim, in order. Omit if none were listed.
- "websites": include every URL listed under the opponent. Omit the field if none were listed.
- If an opponent's section says "No public information found as of [date]. You should conduct local research.", set "political_summary" to that exact sentence, omit "key_facts", and omit "websites".
- Do not include the candidate being addressed in the opponents array.

MARKDOWN:
{{searchResults}}

Return a JSON object matching the schema.`
