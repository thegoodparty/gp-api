const defaultSegmentToFiltersMap = {
  all: {
    filters: [],
  },
  texting: {
    filters: ['hasCellPhone'],
  },
  doorKnocking: {
    filters: [],
  },
  directMail: {
    filters: [],
  },
  phoneBanking: {
    filters: ['hasLandline'],
  },
  digitalAds: {
    filters: ['hasCellPhone'],
  },
}

export default defaultSegmentToFiltersMap
