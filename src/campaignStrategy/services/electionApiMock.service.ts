import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { ApiCandidate, RaceContextFromApi } from '../types/electionApi.types'

// TODO(when-election-api-ready): replace this constant with an HTTP call to
// election-api. The service interface (getRaceContext returning a
// RaceContextFromApi) stays the same; only the implementation changes.
//
// Candidate names and the office are kept realistic so the LLM gets
// representative input for testing. Emails and personal website URLs are
// scrubbed to example.com placeholders so this fixture file doesn't ship
// real contact info. Some fields are intentionally null to exercise the
// null-handling paths downstream (e.g. Sandy Sun has no email; Rose
// Ashton has no website).
const mockCandidate = (
  partial: Pick<
    ApiCandidate,
    'gpCandidateId' | 'firstName' | 'lastName' | 'fullName'
  > &
    Partial<ApiCandidate>,
): ApiCandidate => ({
  email: null,
  websiteUrl: null,
  party: null,
  isIncumbent: null,
  ...partial,
})

const MOCK_RACE_CONTEXT: RaceContextFromApi = {
  state: 'CA',
  candidateOffice: 'Los Angeles County Assessor',
  officialOfficeName: 'County Assessor//Property Appraiser',
  officeLevel: null,
  officeType: 'Other',
  primaryElectionDate: '2026-06-02',
  generalElectionDate: '2026-11-03',
  relevantElectionDate: '2026-06-02',
  numberOfSeats: 1,
  projectedTurnout: 5816814,
  civicsWinNumber: null,
  winNumberEstimate: 2966576,
  winNumberEffective: 2966576,
  contactsNeededEstimate: 14832880,
  candidateCount: 10,
  candidates: [
    mockCandidate({
      gpCandidateId: 'f01fd152-068e-6085-f5f1-ce2af2320bc6',
      firstName: 'AMANDA',
      lastName: 'GOODMAN',
      fullName: 'AMANDA GOODMAN',
      party: 'Independent',
      email: 'amanda.goodman@example.com',
    }),
    mockCandidate({
      gpCandidateId: '79603e94-6b5e-b8c0-40f5-f75618465ca7',
      firstName: 'Daisy',
      lastName: 'Camberos',
      fullName: 'Daisy Camberos',
      party: 'Green',
      email: 'daisy.camberos@example.com',
    }),
    mockCandidate({
      gpCandidateId: 'e060ebd6-4665-1d7e-55bb-5ee4e6557c2e',
      firstName: 'Jack',
      lastName: 'Test',
      fullName: 'Jack Test',
      party: 'Independent',
      email: 'jack.test@example.com',
    }),
    mockCandidate({
      gpCandidateId: 'e8539f35-b44a-182b-7fc4-8a85d61e8262',
      firstName: 'Jeffrey',
      lastName: 'Prang',
      fullName: 'Jeffrey Prang',
      party: 'Nonpartisan',
      isIncumbent: true,
      email: 'jeffrey.prang@example.com',
      websiteUrl: 'https://example.com/jeffrey-prang',
    }),
    mockCandidate({
      gpCandidateId: 'a8618525-87fb-df5a-ce47-d5e75efd7da6',
      firstName: 'Rob',
      lastName: 'Newland',
      fullName: 'Rob Newland',
      party: 'Other',
      email: 'rob.newland@example.com',
      websiteUrl: 'https://example.com/rob-newland',
    }),
    mockCandidate({
      gpCandidateId: '5806ce16-35de-9389-11e0-4b4940c4ff63',
      firstName: 'ROBERT',
      lastName: 'GONZALEZ',
      fullName: 'ROBERT GONZALEZ',
      party: 'Nonpartisan',
      email: 'robert.gonzalez@example.com',
    }),
    mockCandidate({
      gpCandidateId: 'e7988adb-e021-eb21-cb40-f51dc9e25db5',
      firstName: 'Rose ',
      lastName: 'Ashton ',
      fullName: 'Rose  Ashton ',
      party: 'Independent',
      email: 'rose.ashton@example.com',
    }),
    mockCandidate({
      gpCandidateId: '0bd0d91a-52dc-28fe-e5fa-9950cd7308a0',
      firstName: 'Sandy',
      lastName: 'Sun',
      fullName: 'Sandy Sun',
      party: 'Nonpartisan',
      isIncumbent: false,
    }),
    mockCandidate({
      gpCandidateId: '8d9b4d3b-ff20-c9c8-f609-852c292a2335',
      firstName: 'Stephen',
      lastName: 'A. Adamus',
      fullName: 'Stephen A. Adamus',
      party: 'Nonpartisan',
      isIncumbent: false,
      email: 'stephen.adamus@example.com',
    }),
    mockCandidate({
      gpCandidateId: '9135b657-9da0-2cf7-dc75-9330930d1d2f',
      firstName: 'Steven',
      lastName: 'B. Palty',
      fullName: 'Steven B. Palty',
      party: 'Nonpartisan',
      isIncumbent: false,
      email: 'steven.palty@example.com',
    }),
  ],
}

@Injectable()
export class ElectionApiMockService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ElectionApiMockService.name)
  }

  getRaceContext(campaignId: number): RaceContextFromApi {
    // Hard-fail in production. The mock ignores campaignId and returns a
    // hardcoded LA County Assessor fixture; shipping it would silently
    // serve wrong data to every campaign. When the real election-api
    // client lands, this service is replaced entirely.
    if (process.env.NODE_ENV === 'production') {
      throw new InternalServerErrorException(
        'ElectionApiMockService cannot run in production',
      )
    }
    this.logger.debug(
      { campaignId },
      'Returning mock race context (election-api not yet integrated)',
    )
    return MOCK_RACE_CONTEXT
  }
}
