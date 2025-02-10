export const truncateZip = (zip: string) =>
  zip.length > 5 ? zip.substring(0, 5) : zip
