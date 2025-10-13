export const cleanL2DistrictName = (L2DistrictName: string) => {
  const segments = L2DistrictName.split('##')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (segments.length === 0) return L2DistrictName
  let longest = segments[0]
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].length > longest.length) {
      longest = segments[i]
    }
  }
  return longest
}
