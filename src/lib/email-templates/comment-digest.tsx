import * as React from 'react'
import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Comment {
  name?: string
  body?: string
  visibility?: string
}

interface Props {
  eventName?: string
  hostName?: string
  comments?: Comment[]
  manageUrl?: string
}

const Email = ({
  eventName = 'your event',
  hostName = 'there',
  comments = [],
  manageUrl = '',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New comments on your invitation</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New comments on your invitation</Heading>
        <Text style={text}>
          Hi {hostName}, guests left {comments.length === 1 ? 'a new comment' : `${comments.length} new comments`} on
          <strong> {eventName}</strong>.
        </Text>
        {comments.map((c, i) => (
          <React.Fragment key={i}>
            <Hr style={rule} />
            <Text style={meta}>
              {c.name || 'A guest'} · {c.visibility === 'public' ? 'Public' : 'Private to you'}
            </Text>
            <Text style={quote}>{c.body}</Text>
          </React.Fragment>
        ))}
        {manageUrl ? (
          <Text style={text}>
            Read and reply: <a href={manageUrl}>{manageUrl}</a>
          </Text>
        ) : null}
        <Text style={footer}>The Kenroe Collective</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => {
    const n = Array.isArray(d?.comments) ? d.comments.length : 0
    return n === 1
      ? 'A guest commented on your invitation — The Kenroe Collective'
      : `${n} new comments on your invitation — The Kenroe Collective`
  },
  displayName: 'Invitation comment digest',
  previewData: {
    eventName: 'Sunset Rooftop Party',
    hostName: 'Christopher',
    comments: [
      { name: 'Wren Alvarez', body: 'Can I bring my sister?', visibility: 'private' },
      { name: 'Dana Cole', body: 'So excited for this!', visibility: 'public' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const meta = { fontSize: '12px', color: '#777', margin: '0 0 4px' }
const quote = { fontSize: '14px', color: '#111', lineHeight: '1.6', margin: '0 0 12px' }
const rule = { borderColor: '#eee', margin: '16px 0' }
const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
