import * as React from 'react'

import { Button, Head, Link, Text } from '@react-email/components'

/**
 * Shared email <Head> that pins the light color scheme.
 *
 * Apple Mail (and iCloud on iOS) aggressively re-colors dark backgrounds in
 * dark mode, which made the previous black CTA button blend into a black
 * canvas and appear invisible. Declaring `light only` keeps the colors we ship.
 */
export const EmailHead = () => (
  <Head>
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
  </Head>
)

/**
 * Brand call-to-action button plus a copy/paste fallback link, so the email is
 * never a dead end if a client refuses to render the button.
 */
export const EmailCta = ({ href, label }: { href: string; label: string }) => (
  <>
    <Button style={ctaButton} href={href}>
      {label}
    </Button>
    <Text style={fallbackLabel}>
      Button not showing? Copy and paste this link into your browser:
    </Text>
    <Text style={fallbackUrlWrap}>
      <Link href={href} style={fallbackUrl}>
        {href}
      </Link>
    </Text>
  </>
)

const ctaButton = {
  backgroundColor: '#c9a84c',
  color: '#0d0d0d',
  border: '2px solid #8a6f1f',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '13px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}

const fallbackLabel = {
  fontSize: '12px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '26px 0 6px',
}

const fallbackUrlWrap = {
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0',
  wordBreak: 'break-all' as const,
}

const fallbackUrl = { color: '#8a1a1a', textDecoration: 'underline' }
