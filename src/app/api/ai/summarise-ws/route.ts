import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions) as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { wsName, catName, contextNote, additionalContext, deadline, notes } = await req.json()

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role:'user',
        content:`Write a concise pre-meeting briefing (3-5 bullet points starting with •) for "${wsName}" at Jubel Beer (${catName}).

Pulled context:
${contextNote}
${additionalContext?`\nAdditional context: ${additionalContext}`:''}
${deadline?`\nDeadline: ${new Date(deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`:''}
${notes?`\nBackground: ${notes}`:''}

Cover: current status, key decision or action needed this week, any blockers. Max 5 bullets under 20 words each. Just the bullets, no preamble.`
      }]
    })
    const text = response.content.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('\n')
    return NextResponse.json({ text })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
