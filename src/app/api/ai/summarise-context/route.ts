import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '../../auth/[...nextauth]/route'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions) as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { wsName, catName, rawContext, additionalContext } = await req.json()

  if (!rawContext?.trim() && !additionalContext?.trim()) {
    return NextResponse.json({ error: 'No context to summarise' }, { status: 400 })
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Write a concise pre-meeting briefing (4-5 bullet points starting with •) for "${wsName}" (${catName} at Jubel Beer).

${rawContext ? `Context from Gmail and Drive:\n${rawContext}` : ''}
${additionalContext ? `\nAdditional context:\n${additionalContext}` : ''}

Cover: current status, key decisions needed this week, any blockers or deadlines. Each bullet under 20 words. Just the bullets, no preamble.`
      }]
    })
    const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    return NextResponse.json({ text })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
