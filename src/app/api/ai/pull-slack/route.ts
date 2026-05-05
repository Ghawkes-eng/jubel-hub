import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '../../auth/[...nextauth]/route'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions) as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { wsName } = await req.json()
  const slackToken = process.env.SLACK_BOT_TOKEN

  if (!slackToken) {
    return NextResponse.json({ 
      text: '• Slack not connected yet — add a SLACK_BOT_TOKEN to Replit Secrets to enable Slack search.',
      error: null 
    })
  }

  // Search Slack directly using Web API
  try {
    const searchRes = await fetch(`https://slack.com/api/search.messages?query=${encodeURIComponent(wsName)}&count=10`, {
      headers: { Authorization: `Bearer ${slackToken}` }
    })
    const data = await searchRes.json()

    if (!data.ok || !data.messages?.matches?.length) {
      return NextResponse.json({ text: `• No recent Slack messages found about "${wsName}".` })
    }

    const messages = data.messages.matches.slice(0, 6).map((m: any) =>
      `#${m.channel?.name}: ${m.username}: ${m.text?.slice(0, 150)}`
    ).join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Summarise these Slack messages about "${wsName}" at Jubel Beer into 3-4 bullet points capturing the key discussions:\n\n${messages}`
      }]
    })
    const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    return NextResponse.json({ text })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
