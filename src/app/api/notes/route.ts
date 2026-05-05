import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

async function getOrCreateUser(session: any) {
  const email = session.user.email
  // Try to find existing user
  const { data: existing } = await supabaseAdmin
    .from('users').select('id').eq('email', email).single()
  if (existing) return existing.id
  // Create new user
  const { data: created } = await supabaseAdmin
    .from('users').insert({ email, name: session.user.name, image: session.user.image }).select('id').single()
  return created?.id
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = await getOrCreateUser(session)
  if (!userId) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('notes')
    .select('*, workstreams(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) console.error('Notes fetch error:', error)
  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = await getOrCreateUser(session)
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin.from('notes').insert({
    user_id: userId,
    content: body.content,
    cat_id: body.cat_id || 'aob',
    ws_id: body.ws_id || null,
    priority: body.priority || 'normal',
    consumed: false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
