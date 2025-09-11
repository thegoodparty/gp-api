const defaultSegmentToFiltersMap = {
  all: {
    filters: {},
  },
  texting: {
    filters: {
      VoterTelephones_CellPhoneFormatted: true,
    },
  },
  doorKnocking: {
    filters: {},
  },
  directMail: {
    filters: {},
  },
  phoneBanking: {
    filters: {
      VoterTelephones_LandlineFormatted: true,
    },
  },
  digitalAds: {
    filters: {
      VoterTelephones_CellPhoneFormatted: true,
    },
  },
}

export default defaultSegmentToFiltersMap
