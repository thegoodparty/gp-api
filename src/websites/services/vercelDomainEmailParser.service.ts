import { Injectable } from '@nestjs/common'

export type ParsedVercelDomainVerificationEmail = {
  domain: string
  verificationUrl: string
}

type EmailInput = {
  from: string
  subject: string
  text: string
  html: string
}

const VERCEL_SENDER_DOMAIN = 'vercel.com'

const VERIFICATION_URL_REGEX =
  /https:\/\/vercel\.com\/[^\s"'<>]*verify[^\s"'<>]*/gi

const DOMAIN_IN_SUBJECT_REGEX = /([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i

@Injectable()
export class VercelDomainEmailParserService {
  parse(email: EmailInput): ParsedVercelDomainVerificationEmail | null {
    if (!this.isFromVercel(email.from)) {
      return null
    }

    const verificationUrl = this.extractVerificationUrl(email.html, email.text)
    if (!verificationUrl) {
      return null
    }

    const domain = this.extractDomain(
      email.subject,
      email.text,
      verificationUrl,
    )
    if (!domain) {
      return null
    }

    return { domain, verificationUrl }
  }

  private isFromVercel(from: string): boolean {
    const address = this.extractEmailAddress(from)
    if (!address) {
      return false
    }
    const at = address.lastIndexOf('@')
    if (at === -1 || at === address.length - 1) {
      return false
    }
    const senderDomain = address.slice(at + 1).toLowerCase()
    return (
      senderDomain === VERCEL_SENDER_DOMAIN ||
      senderDomain.endsWith(`.${VERCEL_SENDER_DOMAIN}`)
    )
  }

  private extractEmailAddress(from: string): string | null {
    const bracketMatch = /<([^>]+)>/.exec(from)
    const candidate = (bracketMatch ? bracketMatch[1] : from).trim()
    if (!candidate || candidate.includes(' ')) {
      return null
    }
    return candidate
  }

  private extractVerificationUrl(html: string, text: string): string | null {
    const sources = [html, text]
    for (const source of sources) {
      VERIFICATION_URL_REGEX.lastIndex = 0
      const match = VERIFICATION_URL_REGEX.exec(source)
      if (match) {
        return match[0]
      }
    }
    return null
  }

  private extractDomain(
    subject: string,
    text: string,
    verificationUrl: string,
  ): string | null {
    const fromUrl = this.extractDomainFromUrl(verificationUrl)
    if (fromUrl) {
      return fromUrl
    }
    const fromSubject = DOMAIN_IN_SUBJECT_REGEX.exec(subject)?.[1]
    if (fromSubject) {
      return fromSubject.toLowerCase()
    }
    const fromText = DOMAIN_IN_SUBJECT_REGEX.exec(text)?.[1]
    return fromText ? fromText.toLowerCase() : null
  }

  private extractDomainFromUrl(verificationUrl: string): string | null {
    try {
      const url = new URL(verificationUrl)
      const domainParam =
        url.searchParams.get('domain') ?? url.searchParams.get('name')
      if (domainParam) {
        return domainParam.toLowerCase()
      }
      return null
    } catch {
      return null
    }
  }
}
