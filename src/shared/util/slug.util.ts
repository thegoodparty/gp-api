import slugify from 'slugify'

export function buildSlug(name: string, suffix?: string) {
  return `${slugify(`${name}`, { lower: true })}${suffix ? `-${suffix}` : ''}`
}
