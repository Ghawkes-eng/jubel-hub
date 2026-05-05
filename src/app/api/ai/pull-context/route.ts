import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions) as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { wsName, catName, additionalContext } = await req.json()
  const accessToken = session.googleToken

  if (!accessToken) {
    return NextResponse.json({ error: 'No Google access token — please sign out and back in' }, { status: 401 })
  }

  const searchQuery = [wsName, additionalContext?.slice(0,80)].filter(Boolean).join(' ')
  const errors: string[] = []
  let gmailContent = ''
  let driveContent = ''

  // ── Gmail via direct REST API ─────────────────────────────────────────────
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery + ' newer_than:30d')}&maxResults=8`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    )

    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}))
      errors.push(`Gmail: ${listRes.status} ${err?.error?.message || listRes.statusText}`)
      if (listRes.status === 401) {
        return NextResponse.json({ error: 'Google token expired — please sign out and sign back in to refresh it.' }, { status: 401 })
      }
    } else {
      const data = await listRes.json()
      const messages = data.messages || []
      const snippets: string[] = []

      for (const msg of messages.slice(0, 5)) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (msgRes.ok) {
          const m = await msgRes.json()
          const headers: Record<string,string> = {}
          ;(m.payload?.headers || []).forEach((h: any) => { headers[h.name] = h.value })
          snippets.push(`"${headers.Subject || '(no subject)'}" from ${headers.From || 'unknown'} — ${m.snippet || ''}`)
        }
      }
      if (snippets.length) gmailContent = snippets.join('\n')
      else gmailContent = `(No emails found mentioning "${wsName}")`
    }
  } catch (e: any) {
    errors.push(`Gmail exception: ${e.message}`)
    console.error('Gmail error:', e.message)
  }

  // ── Drive via direct REST API ─────────────────────────────────────────────
  try {
    const q = `fullText contains '${wsName.replace(/'/g,"\\'")}' and trashed = false`
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=8&orderBy=modifiedTime+desc&fields=files(id,name,modifiedTime,mimeType)`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    )

    if (!driveRes.ok) {
      const err = await driveRes.json().catch(() => ({}))
      errors.push(`Drive: ${driveRes.status} ${err?.error?.message || driveRes.statusText}`)
      if (driveRes.status === 401) {
        return NextResponse.json({ error: 'Google token expired — please sign out and sign back in.' }, { status: 401 })
      }
    } else {
      const data = await driveRes.json()
      const files = data.files || []
      if (files.length) {
        driveContent = files.map((f: any) =>
          `"${f.name}" (${(f.mimeType || '').split('.').pop()}) — modified ${f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('en-GB') : 'unknown'}`
        ).join('\n')
      } else {
        driveContent = `(No Drive files found mentioning "${wsName}")`
      }
    }
  } catch (e: any) {
    errors.push(`Drive exception: ${e.message}`)
    console.error('Drive error:', e.message)
  }

  // ── If both hard-failed, return the actual errors ─────────────────────────
  if (!gmailContent && !driveContent && errors.length) {
    return NextResponse.json({
      error: `Could not connect to Google APIs. Errors: ${errors.join(' | ')}. Try signing out and back in.`
    }, { status: 500 })
  }

  // ── Ask Claude to summarise ───────────────────────────────────────────────
  const context = [
    gmailContent ? `Recent emails:\n${gmailContent}` : '',
    driveContent ? `Recent Drive files:\n${driveContent}` : '',
  ].filter(Boolean).join('\n\n')

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Based on this data from Gmail and Google Drive about "${wsName}" (${catName} at Jubel Beer), write 4-5 bullet points summarising the most relevant recent activity, decisions or open items for a weekly catch-up. Be specific.${additionalContext ? `\n\nAdditional context: ${additionalContext}` : ''}

${context}`
      }]
    })
    const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    return NextResponse.json({ text })
  } catch (e: any) {
    console.error('Claude error:', e.message)
    return NextResponse.json({ error: `AI summarisation failed: ${e.message}` }, { status: 500 })
  }
}
