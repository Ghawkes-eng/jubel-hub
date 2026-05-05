import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '../../auth/[...nextauth]/route'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions) as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content, date } = await req.json()

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Write a concise post-meeting summary for a weekly 1:1 catch-up at Jubel Beer on ${date}.

Meeting notes:
${content}

Write 3-4 paragraphs covering:
1. The key themes and outcomes of this week's catch-up
2. Most important decisions or updates per workstream (2-3 lines each, only where meaningful)
3. Actions agreed, grouped by owner

Keep it professional but warm. Suitable to send to both the manager (Harry) and the direct report (George). Max 250 words.`
      }]
    })
    const text = response.content.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('\n')
    return NextResponse.json({ text })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
