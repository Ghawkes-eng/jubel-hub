import { createClient } from '@supabase/supabase-js'

// Public client — for browser use
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Server admin client — bypasses RLS, only used in server-side API routes
// Falls back to anon key if service role not set (limited functionality)
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────────

export const CATS = [
  { id:'festivals', name:'Festivals & Events', color:'#2D6A4F',
    kw:['festival','event','snowboxx','cheerzone','hackney','cwg','glastonbury'],
    people:['Alex Russell','Tash Truelove','Teddy','Joe','Michael'] },
  { id:'sports', name:'Sports & Lifestyle', color:'#B5712A',
    kw:['sport','lifestyle','football','rugby','cricket','territory','manchester'],
    people:['Max Machin','Georgia Eversdon','Emma James'] },
  { id:'music', name:'Music & Culture', color:'#6A4E89',
    kw:['music','culture','artist','dj','sammy','virji','gig','tour'],
    people:['Emily'] },
  { id:'brand', name:'Brand Events / Activations', color:'#9B740A',
    kw:['brand','activation','campaign','sampling','brief','agency'],
    people:['Sam Winter'] },
  { id:'aob', name:'AOB', color:'#5A5550', kw:[], people:[] },
]

export function autoTag(text: string): string {
  const l = text.toLowerCase()
  for (const cat of CATS) {
    if (cat.id === 'aob') continue
    if (cat.kw.some(k => l.includes(k))) return cat.id
    if (cat.people.some(p => l.includes(p.split(' ')[0].toLowerCase()))) return cat.id
  }
  return 'aob'
}
