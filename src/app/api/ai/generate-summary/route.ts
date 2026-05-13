import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { content, date, contactName } = body

    if (!content || content.trim().length < 10) {
      return NextResponse.json({ text: 'No meeting notes to summarise — add notes during the meeting first.' })
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Write a post-meeting summary for a weekly 1:1 between George and ${contactName || 'their colleague'} at Jubel Beer on ${date || 'today'}.

Meeting notes:
${content}

Write 2-3 short paragraphs covering: key themes and outcomes, decisions made, actions agreed. Professional but warm tone. Max 200 words.`
      }]
    })

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    return NextResponse.json({ text })
  } catch (e: any) {
    console.error('Generate summary error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
