const EXPANSION: Record<string, string[]> = {
  LOCAL: ['Local', 'Township'],
  COUNTY: ['County', 'Regional'],
  STATE: ['State'],
  FEDERAL: ['Federal'],
  CITY: ['City'],
  JUDICIAL: ['Judicial'],
}

export const expandLevelToDisplayLevels = (
  level: string | undefined,
): string[] | undefined => {
  if (!level) return undefined
  const key = level.toUpperCase()
  return EXPANSION[key] ?? [level]
}
