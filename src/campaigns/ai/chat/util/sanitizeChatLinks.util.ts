// Link safety net for assistant answers. The model occasionally emits broken
// or fabricated links (relative paths, javascript:/data: URLs, malformed
// targets). We never want those reaching a candidate, so before persisting and
// before the terminal `done` chunk we downgrade unsafe Markdown links to their
// plain label text and keep only well-formed, allowlisted targets.

// Protocols we consider safe to surface as clickable links.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

// Internal hosts we trust. External https links are allowed too (legitimate
// references), but anything that isn't a parseable absolute URL with a safe
// protocol is stripped to text.
const INTERNAL_HOST_SUFFIXES = ['goodparty.org']

// Matches a Markdown inline link: [label](target "optional title").
// Captures label (group 1) and the raw target+title (group 2). Image links
// (![alt](src)) are intentionally left untouched — they're handled by the
// renderer and aren't candidate-facing navigation.
//
// The target capture stops at the first ')', so a URL containing a literal
// paren is matched only up to it. That's acceptable here: such links are
// rejected as unverifiable and downgraded to text anyway, and well-formed
// candidate-facing links don't carry unescaped parens.
const MARKDOWN_LINK_REGEX = /(?<!!)\[([^\]]*)\]\(([^)]*)\)/g

const isInternalHost = (host: string): boolean =>
  INTERNAL_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  )

// Tracking / analytics query params the model sometimes copies into URLs. They
// add no value for a candidate, look suspicious, and (in the case of GA's `_gl`
// linker) make links look broken. Stripped from any link we keep.
const TRACKING_PARAM_MATCHERS: ((key: string) => boolean)[] = [
  (k) => k.startsWith('utm_'),
  (k) => k === '_gl',
  (k) => k.startsWith('_ga'),
  (k) => k === '_gac',
  (k) => k === 'gclid',
  (k) => k === 'gclsrc',
  (k) => k === 'dclid',
  (k) => k === 'fbclid',
  (k) => k === 'msclkid',
  (k) => k === 'igshid',
  (k) => k === 'mc_cid',
  (k) => k === 'mc_eid',
]

const isTrackingParam = (key: string): boolean =>
  TRACKING_PARAM_MATCHERS.some((match) => match(key))

/**
 * Removes tracking/analytics params from an http(s) URL while preserving the
 * rest. Returns the input unchanged when it isn't a parseable absolute URL.
 */
export const stripTrackingParams = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return rawUrl
    let changed = false
    for (const key of [...url.searchParams.keys()]) {
      if (isTrackingParam(key)) {
        url.searchParams.delete(key)
        changed = true
      }
    }
    if (!changed) return rawUrl
    // Avoid a dangling "?" when all params were stripped.
    const search = url.searchParams.toString()
    url.search = search ? `?${search}` : ''
    return url.toString()
  } catch {
    return rawUrl
  }
}

/**
 * Returns true when `target` is a link we're willing to keep clickable.
 * `mailto:`/`tel:` are always allowed; http(s) links must parse to an absolute
 * URL with a host. Internal hosts are always kept; external https links are
 * kept as references. Relative paths and unsafe protocols are rejected.
 */
const isSafeLinkTarget = (target: string): boolean => {
  const trimmed = target.trim()
  if (!trimmed) return false

  // Strip a trailing Markdown link title: (url "title")
  const urlOnly = trimmed.split(/\s+/)[0]

  let url: URL
  try {
    url = new URL(urlOnly)
  } catch {
    // Not an absolute URL (relative path, fragment, malformed) — reject.
    return false
  }

  if (!SAFE_PROTOCOLS.has(url.protocol)) return false
  if (url.protocol === 'mailto:' || url.protocol === 'tel:') return true

  // http(s): require a real host. Internal and external both allowed.
  if (!url.hostname) return false
  return isInternalHost(url.hostname) || url.protocol === 'https:'
    ? true
    : // Allow http only for internal hosts; downgrade external http to text
      // since it's neither secure nor verifiable.
      false
}

/**
 * Downgrades unsafe Markdown links in an assistant answer to their plain label
 * text, leaving safe links intact and stripping tracking params from the ones
 * we keep. Bare text passes through unchanged.
 */
export const sanitizeChatLinks = (content: string): string => {
  if (!content) return content
  return content.replace(
    MARKDOWN_LINK_REGEX,
    (_match, label: string, target: string) => {
      const trimmed = target.trim()
      return isSafeLinkTarget(trimmed)
        ? `[${label}](${stripTrackingParams(trimmed)})`
        : label
    },
  )
}

/** Returns the host for an http(s) URL, or null when it isn't parseable. */
const httpHost = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl.trim().split(/\s+/)[0])
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.hostname || null
  } catch {
    return null
  }
}

/**
 * True when `rawUrl` is an http(s) link to an internal (goodparty.org) host.
 * Used to scope reachability checks to hosts we control — avoids adding latency
 * and an SSRF surface for arbitrary external links.
 */
export const isInternalChatLink = (rawUrl: string): boolean => {
  const host = httpHost(rawUrl)
  return host ? isInternalHost(host) : false
}

/**
 * Validates the (already host/protocol-sanitized) Markdown links in an answer
 * and downgrades dead ones to plain text. `isReachable` decides per-URL
 * reachability; it's injected so the caller controls scope (e.g. only check
 * internal hosts), timeouts, and so it stays unit-testable. Links the caller
 * declines to check (returns `true` for) are left intact.
 *
 * Mirrors `sanitizeChatLinks`' image-skipping and label-downgrade behavior.
 */
export const validateChatLinks = async (
  content: string,
  isReachable: (url: string) => Promise<boolean>,
): Promise<string> => {
  if (!content) return content

  const links = [...content.matchAll(MARKDOWN_LINK_REGEX)]
  if (links.length === 0) return content

  // De-dupe URL checks within a single answer.
  const uniqueUrls = [
    ...new Set(
      links
        .map((m) => httpHost(m[2]) && m[2].trim())
        .filter((u): u is string => Boolean(u)),
    ),
  ]
  const reachability = new Map<string, boolean>()
  await Promise.all(
    uniqueUrls.map(async (url) => {
      reachability.set(url, await isReachable(url).catch(() => true))
    }),
  )

  return content.replace(
    MARKDOWN_LINK_REGEX,
    (_match, label: string, target: string) => {
      const trimmed = target.trim()
      // Only http(s) links were candidates for a reachability check; anything
      // else (mailto/tel) is left as-is.
      if (!httpHost(trimmed)) return `[${label}](${trimmed})`
      return reachability.get(trimmed) === false
        ? label
        : `[${label}](${trimmed})`
    },
  )
}
