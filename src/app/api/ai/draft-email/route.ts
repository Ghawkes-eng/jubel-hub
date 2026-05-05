import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions) as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { summary, date, workstreams, adHocItems, actions, harryEmail, contactName, myEmail, myName } = await req.json()
  const accessToken = session.accessToken

  if (!accessToken) return NextResponse.json({ error: 'No Google access token — sign out and back in' }, { status: 401 })

  // Build email body with Claude
  const wsSection = workstreams.filter((w:any)=>w.notes).map((w:any)=>`${w.name}: ${w.notes}`).join('\n')
  const adhocSection = adHocItems?.length ? adHocItems.map((i:any)=>`${i.title}: ${i.notes||'discussed'}`).join('\n') : ''
  const actionsSection = actions.filter((a:any)=>!a.done).map((a:any)=>`• ${a.owner} — ${a.content} (${a.ws})`).join('\n')

  let emailBody = ''
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Write a friendly, professional catch-up email from ${myName} to ${contactName||'Harry'} summarising their weekly 1:1 at Jubel Beer on ${date}.

Summary: ${summary}
${wsSection?`\nWorkstream updates:\n${wsSection}`:''}
${adhocSection?`\nOther topics discussed:\n${adhocSection}`:''}
${actionsSection?`\nOpen actions:\n${actionsSection}`:''}

Format: warm opener, key updates in short paragraphs, clear actions list, casual sign-off. Max 200 words. No subject line needed.`
      }]
    })
    emailBody = response.content.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('\n')
  } catch (e:any) {
    return NextResponse.json({ error: 'AI failed: '+e.message }, { status: 500 })
  }

  // Create Gmail draft using REST API
  const subject = `Catch-up notes${contactName ? ' with '+contactName : ''} — ${date}`
  const emailContent = [
    `To: ${harryEmail}`,
    `CC: ${myEmail}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    emailBody
  ].join('\n')

  const encoded = Buffer.from(emailContent).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')

  const draftRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw: encoded } })
  })

  if (!draftRes.ok) {
    const err = await draftRes.json().catch(()=>({}))
    return NextResponse.json({ error: `Gmail error: ${err?.error?.message || draftRes.statusText}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
