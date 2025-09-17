const defaultSegmentToFiltersMap = {
  all: {
    filters: [],
  },
  texting: {
    filters: ['cellPhoneFormatted'],
  },
  doorKnocking: {
    filters: [],
  },
  directMail: {
    filters: [],
  },
  phoneBanking: {
    filters: ['landlineFormatted'],
  },
  digitalAds: {
    filters: ['cellPhoneFormatted'],
  },
}

export default defaultSegmentToFiltersMap
