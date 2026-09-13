import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import React from 'react'
import type { TemplateEntry } from './registry'

interface Props {
  title?: string
  subtitle?: string
  intro?: string
  /** Label/value summary pairs. */
  pairs?: { label: string; value: string }[]
  /** Optional detail table: first array is the header row. */
  columns?: string[]
  rows?: (string | number)[][]
  note?: string
  truncated?: number
}

const ReportDeliveryEmail = ({
  title = 'Report',
  subtitle = '',
  intro = '',
  pairs = [],
  columns = [],
  rows = [],
  note = '',
  truncated = 0,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${title}${subtitle ? ` — ${subtitle}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Text style={eyebrow}>The Kenroe Collective • Report</Text>
          <Heading style={heading}>{title}</Heading>
          {subtitle ? <Text style={meta}>{subtitle}</Text> : null}
          {intro ? <Text style={para}>{intro}</Text> : null}

          {pairs.length ? (
            <table style={table} cellPadding={0} cellSpacing={0}>
              <tbody>
                {pairs.map((p, i) => (
                  <tr key={i}>
                    <td style={keyCell}>{p.label}</td>
                    <td style={valCell}>{p.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {columns.length && rows.length ? (
            <table style={table} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  {columns.map((c, i) => (
                    <th key={i} style={thCell}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} style={tdCell}>
                        {String(cell ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {truncated > 0 ? (
            <Text style={meta}>
              {truncated} more row{truncated === 1 ? '' : 's'} are in the full CSV export in the dashboard.
            </Text>
          ) : null}
          {note ? <Text style={meta}>{note}</Text> : null}
        </Section>
        <Text style={footer}>Sent from The Kenroe Collective because an owner or admin requested this report.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ReportDeliveryEmail,
  subject: (data: Record<string, any>) => String(data?.title ?? 'Your report') ,
  displayName: 'Report delivery',
  previewData: {
    title: 'Guest report — A Summer Jam',
    subtitle: 'Saturday, June 21, 2026 · Centennial Park',
    intro: 'Everything guests submitted for this event, in one place.',
    pairs: [
      { label: 'Guest rows', value: '24' },
      { label: 'Attending', value: '18' },
      { label: 'Outstanding', value: '$120.00' },
    ],
    columns: ['Name', 'RSVP', 'Dietary restrictions'],
    rows: [
      ['Ada Rowe', 'Attending', 'Gluten free'],
      ['Miles Cato', 'Maybe', ''],
    ],
    note: 'Self-reported host payments, not platform-verified.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif' }
const container = { padding: '24px 20px', maxWidth: '640px' }
const card = {
  border: '1px solid #e6e2da',
  borderRadius: '16px',
  padding: '24px',
  backgroundColor: '#fdfcfa',
}
const eyebrow = {
  fontSize: '10px',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  color: '#8a8378',
  margin: '0 0 8px',
}
const heading = { fontSize: '22px', margin: '0 0 4px', color: '#1b1a18' }
const meta = { fontSize: '12px', color: '#6b6559', margin: '4px 0' }
const para = { fontSize: '14px', color: '#2b2a27', lineHeight: '22px', margin: '10px 0' }
const table = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  margin: '14px 0',
  fontFamily: 'Arial, Helvetica, sans-serif',
}
const keyCell = {
  fontSize: '12px',
  color: '#6b6559',
  padding: '6px 8px',
  borderBottom: '1px solid #eee8df',
  width: '55%',
}
const valCell = {
  fontSize: '12px',
  color: '#1b1a18',
  padding: '6px 8px',
  borderBottom: '1px solid #eee8df',
  fontWeight: 'bold' as const,
}
const thCell = {
  fontSize: '10px',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  color: '#6b6559',
  textAlign: 'left' as const,
  padding: '6px 8px',
  borderBottom: '1px solid #ddd5c9',
}
const tdCell = {
  fontSize: '11px',
  color: '#2b2a27',
  padding: '6px 8px',
  borderBottom: '1px solid #f1ece4',
  verticalAlign: 'top' as const,
}
const footer = { fontSize: '11px', color: '#8a8378', margin: '14px 4px 0' }
