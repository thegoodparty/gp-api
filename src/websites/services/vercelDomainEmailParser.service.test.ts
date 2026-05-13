import { describe, expect, it } from 'vitest'
import { VercelDomainEmailParserService } from './vercelDomainEmailParser.service'

const parser = new VercelDomainEmailParserService()

const verifyUrl =
  'https://vercel.com/verify-domain/abc123?domain=candidate-jones.com&token=tok_456'

const baseHtml = `
  <html>
    <body>
      Please verify your domain by clicking the link below:
      <a href="${verifyUrl}">Verify Domain</a>
    </body>
  </html>
`

describe('VercelDomainEmailParserService', () => {
  it('parses a well-formed Vercel verification email and extracts the URL + domain from the link', () => {
    const result = parser.parse({
      from: 'no-reply@vercel.com',
      subject: 'Verify your domain candidate-jones.com',
      text: 'Click here to verify: ' + verifyUrl,
      html: baseHtml,
    })

    expect(result).toEqual({
      domain: 'candidate-jones.com',
      verificationUrl: verifyUrl,
    })
  })

  it('falls back to the subject line for the domain if the URL has no domain param', () => {
    const urlWithoutDomain = 'https://vercel.com/verify-domain/abc?token=tok'
    const html = baseHtml.replace(verifyUrl, urlWithoutDomain)
    const result = parser.parse({
      from: 'domains@vercel.com',
      subject: 'Action required: verify Foo-Bar.com',
      text: '',
      html,
    })

    expect(result).toEqual({
      domain: 'foo-bar.com',
      verificationUrl: urlWithoutDomain,
    })
  })

  it('returns null when the sender is not Vercel', () => {
    const result = parser.parse({
      from: 'attacker@evil.com',
      subject: 'Verify your domain foo.com',
      text: '',
      html: baseHtml,
    })
    expect(result).toBeNull()
  })

  it('returns null when no verification URL is found', () => {
    const result = parser.parse({
      from: 'no-reply@vercel.com',
      subject: 'A different Vercel email about foo.com',
      text: 'Nothing actionable here.',
      html: '<p>Welcome to Vercel.</p>',
    })
    expect(result).toBeNull()
  })

  it('ignores non-vercel.com URLs even if the sender is Vercel', () => {
    const result = parser.parse({
      from: 'no-reply@vercel.com',
      subject: 'Verify foo.com',
      text: 'Click https://evil.com/verify?token=phish',
      html: '<a href="https://evil.com/verify?token=phish">Verify</a>',
    })
    expect(result).toBeNull()
  })

  it('accepts the rfc-style "Display Name <addr>" sender form', () => {
    const result = parser.parse({
      from: 'Vercel Domains <no-reply@vercel.com>',
      subject: 'Verify foo.com',
      text: verifyUrl,
      html: baseHtml,
    })
    expect(result?.verificationUrl).toBe(verifyUrl)
  })

  it('accepts true subdomains of vercel.com', () => {
    const result = parser.parse({
      from: 'notifications@mail.vercel.com',
      subject: 'Verify foo.com',
      text: verifyUrl,
      html: baseHtml,
    })
    expect(result?.verificationUrl).toBe(verifyUrl)
  })

  it('prefers plain-text URL when html href encodes query separators as &amp;', () => {
    const htmlEncodedUrl = verifyUrl.replaceAll('&', '&amp;')
    const result = parser.parse({
      from: 'no-reply@vercel.com',
      subject: 'Verify foo.com',
      text: `Click ${verifyUrl}`,
      html: `<a href="${htmlEncodedUrl}">Verify</a>`,
    })

    expect(result).toEqual({
      domain: 'candidate-jones.com',
      verificationUrl: verifyUrl,
    })
  })

  it('decodes &amp; in html URL when text body is empty', () => {
    const htmlEncodedUrl = verifyUrl.replaceAll('&', '&amp;')
    const result = parser.parse({
      from: 'no-reply@vercel.com',
      subject: 'Verify foo.com',
      text: '',
      html: `<a href="${htmlEncodedUrl}">Verify</a>`,
    })

    expect(result).toEqual({
      domain: 'candidate-jones.com',
      verificationUrl: verifyUrl,
    })
  })

  it('rejects spoofed lookalike domains that merely include "@vercel.com" as a substring', () => {
    const spoofs = [
      'attacker@vercel.com.evil.tld',
      'attacker@subvercel.com',
      'attacker@vercel-evil.com',
      'attacker@notvercel.com',
    ]
    for (const from of spoofs) {
      const result = parser.parse({
        from,
        subject: 'Verify foo.com',
        text: verifyUrl,
        html: baseHtml,
      })
      expect(result, `from=${from} should be rejected`).toBeNull()
    }
  })
})
