import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

async function getOrCreateUser(session: any) {
  const email = session.user.email
  const { data: existing } = await supabaseAdmin
    .from('users').select('id').eq('email', email).single()
  if (existing) return existing.id
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
    .from('workstreams')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) console.error('Workstreams fetch error:', error)
  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = await getOrCreateUser(session)
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin.from('workstreams').insert({
    user_id: userId,
    name: body.name,
    cat_id: body.cat_id || 'aob',
    status: body.status || 'active',
    owner: body.owner || 'Me',
    deadline: body.deadline || null,
    link: body.link || null,
    notes: body.notes || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
