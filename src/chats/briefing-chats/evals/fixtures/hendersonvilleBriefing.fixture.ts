import type { Annotation, MeetingBriefing } from '../../../../generated/prisma'
import {
  AnnotationKind,
  AnnotationResourceType,
} from '../../../../generated/prisma'
import { buildSystemPrompt } from '../../services/systemPromptBuilder'

// systemPromptBuilder.ts does not export its argument interface, so we
// derive it from the function signature. Using Parameters<> keeps the
// fixture in lockstep with builder changes without touching the builder.
export type BuildSystemPromptArgs = Parameters<typeof buildSystemPrompt>[0]

const briefing: MeetingBriefing = {
  id: 'brief-hendersonville-2026-05-19',
  electedOfficeId: 'office-hendersonville-council',
  meetingDate: new Date('2026-05-19T00:00:00.000Z'),
  meetingTime: '6:30 PM',
  meetingTimezone: 'America/New_York',
  experimentRunId: 'run-hville-2026-05-19',
  artifactBucket: 'briefing-artifacts',
  artifactKey: 'office-hendersonville-council/2026-05-19.md',
  createdAt: new Date('2026-05-12T12:00:00.000Z'),
  updatedAt: new Date('2026-05-12T12:00:00.000Z'),
  artifact: null,
}

const annotation: Annotation = {
  id: 'ann-hville-1',
  authorUserId: 42,
  kind: AnnotationKind.chat,
  resourceId: briefing.id,
  resourceType: AnnotationResourceType.briefing,
  jsonPath: null,
  start: null,
  end: null,
  createdAt: new Date('2026-05-13T10:00:00.000Z'),
  updatedAt: new Date('2026-05-13T10:00:00.000Z'),
  noteId: null,
  chatConversationId: 'conv-hville-1',
  annotationBugReportId: null,
}

const artifactContent = `# Briefing: Hendersonville, NC — Regular Council Meeting

Meeting date: 2026-05-19
Body: City Council
Estimated read time: 8 min

## Executive Summary

Two contentious items: short-term-rental ordinance and a new water-rate study.

STR ordinance has heavy public-comment momentum; rate study is technical but
politically loaded ahead of next year's budget.

## Priority Issue 1 — Amendment to Short-Term Rental Ordinance

Category: land use
Presenter: Planning Director (Jamie Cole)

What you need to do: Decide whether to cap short-term-rental ownership at one
property per individual. Vocal opposition from real-estate interests; vocal
support from neighborhood associations.

Ask this in the room: How will the cap be enforced? Who audits LLC ownership
chains?

Try this: Propose a 6-month sunset clause so we can review enforcement data
before making it permanent.

What is happening: Staff is recommending an amendment to existing Chapter 12
limiting STR registrations to one per natural person, with a 90-day transition
window. Current ordinance has no cap; ~340 active STRs are concentrated in
<50 owners.

Decision needed: Approve, deny, or send back to committee with modifications.

Why it matters: Three neighborhood associations have organized against
investor concentration. Real-estate-industry groups argue it will harm
property values and tax base. ~$1.8M annual occupancy tax revenue is at stake.

Recommendation: Approve with the sunset clause. Gets the political win and
bakes in an off-ramp if enforcement falters.

Action item: Move to approve as amended with a 6-month sunset.

Ask this: What is the projected impact on occupancy-tax revenue?

Supporting context: Asheville passed a similar cap in 2024; enforcement
litigation is ongoing.

Supporting documents:
- Staff Memo on STR Amendment — https://example.com/str-memo.pdf

## Priority Issue 2 — Authorize Cost-of-Service Water Rate Study

Category: infrastructure
Presenter: Finance Director (Pat Howell)

What you need to do: Decide whether to fund a third-party cost-of-service
rate study that will likely conclude rates need to rise 8-15% over the next
4 years.

Ask this in the room: What is our debt-service coverage right now and what
does it need to be by 2028?

What is happening: Public Works requests $180K from FY2026 reserves to
engage Raftelis Financial Consultants for a cost-of-service study. Aging
infrastructure (avg 47 years old) and three large capital projects in the
5-year CIP drive the need.

Decision needed: Approve the $180K contract or defer to next budget cycle.

Why it matters: Without the study, the council will be setting rates blind
during the FY2027 budget. Deferring also delays a $24M revenue bond rating
review.

Recommendation: Approve. The study itself is not a rate hike; it is the
basis for an informed conversation.

Action item: Move to approve the Raftelis contract.

Ask this: What is the realistic timeline if we defer six months? Does it
push the bond review?

## Full Agenda

1. Call to Order & Roll Call — procedural
2. Public Comment Period — procedural. Open period — likely heavy
   STR-ordinance turnout based on social-media signal.
3. Amendment to Short-Term Rental Ordinance — land use, PRIORITY #1.
   Vote on the one-per-owner cap; see priority issue #1.
4. Authorize Cost-of-Service Water Rate Study — infrastructure,
   PRIORITY #2. $180K contract authorization; see priority issue #2.
5. Acceptance of FY2024 Annual Audit — finance. Routine acceptance of
   the audited financial statements. Auditor present to answer questions.
6. Resolution Recognizing Local Volunteer of the Year — ceremonial.
7. Adjournment — procedural.

Agenda summary: Seven items. Two priority votes (STR cap, water rate
study). One ceremonial item. Standard procedural bookends.
`

export const HENDERSONVILLE_FIXTURE: BuildSystemPromptArgs = {
  briefing,
  annotation,
  artifactContent,
  today: 'May 14, 2026',
  availableToolNames: [
    'get_artifacts',
    'web_search',
    'district_insights',
    'list_district_topics',
  ],
  notesCount: 0,
  user: { firstName: 'Jane', lastName: 'Smith' },
  office: { title: 'Council Member', jurisdiction: null },
  highlight: null,
  parsed: null,
}
