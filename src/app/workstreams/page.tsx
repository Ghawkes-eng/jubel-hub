'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import AppNav from '@/components/layout/AppNav'

const CATS = [
  { id:'festivals', name:'Festivals & Events', color:'#2D6A4F' },
  { id:'sports',    name:'Sports & Lifestyle', color:'#B5712A' },
  { id:'music',     name:'Music & Culture',    color:'#6A4E89' },
  { id:'brand',     name:'Brand Events',       color:'#9B740A' },
  { id:'aob',       name:'AOB',                color:'#5A5550' },
]
const WS_ST = [
  { id:'active',   label:'Active',   color:'#2D6A4F' },
  { id:'on-hold',  label:'On hold',  color:'#B5712A' },
  { id:'blocked',  label:'Blocked',  color:'#DC2626' },
  { id:'complete', label:'Complete', color:'#2D4F6B' },
  { id:'archived', label:'Archived', color:'#888'    },
]
const ACTIVE_STATUSES  = ['active','on-hold','blocked']
const CLOSED_STATUSES  = ['complete','archived']

// ── Client-side Google API calls ─────────────────────────────────────────────
async function fetchGmailContext(accessToken: string, query: string): Promise<string> {
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query + ' newer_than:30d')}&maxResults=8`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!listRes.ok) {
      const err = await listRes.json().catch(()=>({}))
      return `Gmail error ${listRes.status}: ${err?.error?.message || listRes.statusText}`
    }
    const data = await listRes.json()
    const messages = data.messages || []
    if (!messages.length) return `No emails found mentioning "${query.split(' ')[0]}"`

    const snippets: string[] = []
    for (const msg of messages.slice(0,5)) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (msgRes.ok) {
        const m = await msgRes.json()
        const hdrs: Record<string,string> = {}
        ;(m.payload?.headers||[]).forEach((h: any) => { hdrs[h.name]=h.value })
        snippets.push(`"${hdrs.Subject||'(no subject)'}" from ${hdrs.From||'unknown'} — ${m.snippet||''}`)
      }
    }
    return snippets.join(String.fromCharCode(10))
  } catch (e: any) {
    return `Gmail exception: ${e.message}`
  }
}

async function fetchDriveContext(accessToken: string, wsName: string): Promise<string> {
  try {
    const q = `fullText contains '${wsName.replace(/'/g,"\\'")}' and trashed = false`
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=8&orderBy=modifiedTime+desc&fields=files(id,name,modifiedTime,mimeType)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) {
      const err = await res.json().catch(()=>({}))
      return `Drive error ${res.status}: ${err?.error?.message || res.statusText}`
    }
    const data = await res.json()
    const files = data.files || []
    if (!files.length) return `No Drive files found mentioning "${wsName}"`
    return files.map((f: any) =>
      `"${f.name}" — modified ${f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('en-GB') : 'unknown'}`
    ).join(String.fromCharCode(10))
  } catch (e: any) {
    return `Drive exception: ${e.message}`
  }
}

// ── Read a Google Sheet directly by URL ──────────────────────────────────────
function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

async function fetchSheetContext(accessToken: string, sheetUrl: string, wsName: string): Promise<string> {
  const sheetId = extractSheetId(sheetUrl)
  if (!sheetId) return 'Invalid Sheet URL — paste the full Google Sheets URL'

  try {
    // Get sheet metadata first to find tab names
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties,sheets.properties`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!metaRes.ok) {
      const err = await metaRes.json().catch(()=>({}))
      return `Sheet error ${metaRes.status}: ${err?.error?.message || metaRes.statusText}`
    }
    const meta = await metaRes.json()
    const title = meta.properties?.title || 'Sheet'

    // Read first sheet (up to 200 rows)
    const firstSheet = meta.sheets?.[0]?.properties?.title || 'Sheet1'
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(firstSheet)}!A1:Z200`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!dataRes.ok) {
      const err = await dataRes.json().catch(()=>({}))
      return `Sheet read error: ${err?.error?.message || dataRes.statusText}`
    }
    const data = await dataRes.json()
    const rows: string[][] = data.values || []
    if (!rows.length) return `Sheet "${title}" appears to be empty`

    // Format as readable text — headers + first 30 data rows
    const headers = rows[0] || []
    const dataRows = rows.slice(1, 31)
    const formatted = [
      `Sheet: "${title}" (${firstSheet})`,
      `Columns: ${headers.join(', ')}`,
      '',
      ...dataRows.map(row =>
        headers.map((h, i) => `${h}: ${row[i] || ''}`).filter((_,i) => row[i]).join(' | ')
      ).filter(Boolean)
    ].join(String.fromCharCode(10))

    return formatted
  } catch (e: any) {
    return `Sheet exception: ${e.message}`
  }
}

export default function WorkstreamsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [workstreams, setWorkstreams] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [draft, setDraft] = useState({ name:'', cat_id:'festivals', status:'active', owner:'Me', deadline:'', link:'', notes:'' })
  const [pulling, setPulling] = useState<string|null>(null)
  const [summarising, setSummarising] = useState<string|null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [toast, setToast] = useState<string|null>(null)
  const [editState, setEditState] = useState<Record<string,{ additionalContext:string, briefing:string }>>({})

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
    if (status === 'authenticated') fetchData()
  }, [status])

  function showToast(msg: string) { setToast(msg); setTimeout(()=>setToast(null), 5000) }

  async function fetchData() {
    const [wsRes, notesRes] = await Promise.all([fetch('/api/workstreams'), fetch('/api/notes')])
    if (wsRes.ok) {
      const ws = await wsRes.json()
      setWorkstreams(ws)
      const es: Record<string,any> = {}
      ws.forEach((w: any) => { es[w.id] = { additionalContext: w.additional_context||'', briefing: w.briefing||'', sheetUrl: w.sheet_url||'', sheetUrl2: w.sheet_url_2||'' } })
      setEditState(es)
    }
    if (notesRes.ok) setNotes(await notesRes.json())
    setLoading(false)
  }

  function getES(id: string) { return editState[id] || { additionalContext:'', briefing:'', sheetUrl:'', sheetUrl2:'' } }
  function setField(id: string, field: string, value: string) {
    setEditState(prev=>({...prev,[id]:{...getES(id),[field]:value}}))
  }

  async function updateWs(id: string, patch: any) {
    await fetch(`/api/workstreams/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(patch) })
    fetchData()
  }

  async function createWs() {
    if (!draft.name.trim()) return
    const res = await fetch('/api/workstreams', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(draft) })
    if (res.ok) { setCreating(false); setDraft({ name:'', cat_id:'festivals', status:'active', owner:'Me', deadline:'', link:'', notes:'' }); fetchData() }
  }

  async function deleteWs(id: string) {
    if (!window.confirm('Delete this workstream?')) return
    await fetch(`/api/workstreams/${id}`, { method:'DELETE' })
    fetchData()
  }

  // ── Pull context — runs in browser, uses session.googleToken directly ──
  async function pullContext(ws: any) {
    const accessToken = (session as any)?.googleToken
    if (!accessToken) { showToast('No Google access token — sign out and back in'); return }

    setPulling(ws.id)
    showToast(`Pulling context for ${ws.name}…`)

    const es = getES(ws.id)
    const searchQuery = [ws.name, es.additionalContext?.slice(0,80)].filter(Boolean).join(' ')

    const [gmailText, driveText] = await Promise.all([
      fetchGmailContext(accessToken, searchQuery),
      fetchDriveContext(accessToken, ws.name),
    ])

    const combined = [
      gmailText ? `Gmail:\n${gmailText}` : '',
      driveText ? `Drive:\n${driveText}` : '',
    ].filter(Boolean).join('\n\n')

    await updateWs(ws.id, { context_note: combined, context_at: new Date().toISOString() })
    showToast('Context pulled ✓')
    setPulling(null)
  }

  async function pullSlack(ws: any) {
    showToast(`Searching Slack for ${ws.name}…`)
    const res = await fetch('/api/ai/pull-slack', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ wsName: ws.name })
    })
    const d = await res.json()
    if (d.error && !d.text) { showToast('Slack: ' + d.error); return }
    const text = d.text || d.error
    const combined = (ws.context_note ? ws.context_note + `\n\nSlack:\n` : `Slack:\n`) + text
    await updateWs(ws.id, { context_note: combined, context_at: new Date().toISOString() })
    showToast('Slack context added ✓')
  }

  async function pullSheet(ws: any) {
    const accessToken = (session as any)?.googleToken
    const es = getES(ws.id)
    if (!es.sheetUrl) { showToast('Add a Sheet URL to this workstream first'); return }
    if (!accessToken) { showToast('No Google access token — sign out and back in'); return }

    showToast(`Reading sheet for ${ws.name}…`)
    const sheetText = await fetchSheetContext(accessToken, es.sheetUrl, ws.name)

    // Append to existing context
    const combined = (ws.context_note ? ws.context_note + `\n\nSheet data:\n` : `Sheet data:\n`) + sheetText
    await updateWs(ws.id, {
      context_note: combined,
      context_at: new Date().toISOString(),
      sheet_url: es.sheetUrl,
    })
    showToast('Sheet data pulled ✓')
  }

  async function pullSheet2(ws: any) {
    const accessToken = (session as any)?.googleToken
    const es = getES(ws.id)
    if (!es.sheetUrl2) { showToast('Add a second Sheet URL first'); return }
    if (!accessToken) { showToast('No Google access token — sign out and back in'); return }
    showToast(`Reading second sheet for ${ws.name}…`)
    const sheetText = await fetchSheetContext(accessToken, es.sheetUrl2, ws.name)
    const combined = (ws.context_note ? ws.context_note + `\n\nSheet 2 data:\n` : `Sheet 2 data:\n`) + sheetText
    await updateWs(ws.id, { context_note: combined, context_at: new Date().toISOString(), sheet_url_2: es.sheetUrl2 })
    showToast('Second sheet data pulled ✓')
  }

  async function summarise(ws: any) {
    const es = getES(ws.id)
    if (!ws.context_note && !es.additionalContext) {
      showToast('Add context first — pull from Drive/Slack, or type in Additional Context')
      return
    }
    setSummarising(ws.id)
    showToast(`Summarising ${ws.name}…`)

    const res = await fetch('/api/ai/summarise-context', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        wsName: ws.name,
        catName: CATS.find(c=>c.id===ws.cat_id)?.name||'',
        rawContext: ws.context_note || '',
        additionalContext: es.additionalContext || '',
      })
    })
    const d = await res.json()
    if (d.error) { showToast('Error: '+d.error); setSummarising(null); return }

    setField(ws.id, 'briefing', d.text)
    await updateWs(ws.id, { briefing: d.text, briefing_at: new Date().toISOString() })
    showToast('Briefing updated ✓')
    setSummarising(null)
  }

  async function saveAllToSheet() {
    setSavingAll(true)
    showToast('Saving all workstreams to Sheet…')
    const res = await fetch('/api/ai/save-workstreams-sheet', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ workstreams: workstreams.filter(w=>ACTIVE_STATUSES.includes(w.status)) })
    })
    const d = await res.json()
    if (d.error) showToast('Error: '+d.error)
    else showToast("✓ Saved to Sheet tab: '"+d.tabName+"'")
    setSavingAll(false)
  }

  const activeWs  = workstreams.filter(w=>ACTIVE_STATUSES.includes(w.status))
  const closedWs  = workstreams.filter(w=>CLOSED_STATUSES.includes(w.status))
  const groupByCat = (list: any[]) => {
    const g: Record<string,any[]> = {}
    list.forEach(w=>{const k=w.cat_id||'aob'; if(!g[k])g[k]=[]; g[k].push(w)})
    return g
  }
  const activeByCat = useMemo(()=>groupByCat(activeWs),[activeWs])
  const closedByCat = useMemo(()=>groupByCat(closedWs),[closedWs])

  if (loading) return <AppNav><div className="flex items-center justify-center h-64">Loading…</div></AppNav>

  const renderWsCard = (ws: any) => {
    const st    = WS_ST.find(s=>s.id===ws.status)||WS_ST[0]
    const cat   = CATS.find(c=>c.id===ws.cat_id)||CATS[CATS.length-1]
    const expanded = expandedId===ws.id
    const wsNotes  = notes.filter((n:any)=>n.ws_id===ws.id&&!n.consumed)
    const es       = getES(ws.id)
    const isClosed = CLOSED_STATUSES.includes(ws.status)
    const briefingChanged = es.briefing !== (ws.briefing||'')

    return (
      <div key={ws.id} className="bg-white rounded-lg border border-[#E5E5E5] mb-2 overflow-hidden"
        style={{borderLeft:`4px solid ${isClosed?'#ccc':cat.color}`,opacity:isClosed?0.8:1}}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
          onClick={()=>setExpandedId(expanded?null:ws.id)}>
          <span className="text-xs text-[#999]">{expanded?'▾':'▸'}</span>
          <span className="flex-1 font-bold text-sm">{ws.name}</span>
          {ws.briefing&&<span className="text-xs font-medium" style={{color:'#F4631E'}}>✦</span>}
          <select
            className="text-xs px-2 py-1 rounded-full border font-medium cursor-pointer"
            style={{background:st.color+'18',borderColor:st.color+'44',color:st.color}}
            value={ws.status}
            onClick={e=>e.stopPropagation()}
            onChange={e=>{e.stopPropagation();updateWs(ws.id,{status:e.target.value})}}>
            {WS_ST.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {ws.owner&&<span className="text-xs text-[#999] hidden sm:block">{ws.owner}</span>}
          {ws.deadline&&<span className="text-xs text-[#999] hidden sm:block">{new Date(ws.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
        </div>

        {expanded&&(
          <div className="border-t border-[#F0F0F0] p-4 space-y-4">

            {/* Meta */}
            <div className="flex gap-3 flex-wrap text-xs text-[#999]">
              {ws.owner&&<span>👤 {ws.owner}</span>}
              {ws.deadline&&<span>⏱ {new Date(ws.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span>}
              {ws.link&&<a href={ws.link} target="_blank" rel="noreferrer" className="no-underline" style={{color:'#F4631E'}}>↗ Drive folder</a>}
            </div>
            {ws.notes&&<p className="text-xs text-[#999] italic">{ws.notes}</p>}

            {/* Additional context */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Additional context</div>
              <textarea className="textarea text-xs" rows={3}
                placeholder="Add context before pulling — e.g. key contacts, project codes, specific topics to search for. Makes the Drive/email/Slack search more targeted."
                value={es.additionalContext}
                onChange={e=>setField(ws.id,'additionalContext',e.target.value)}
                onBlur={()=>updateWs(ws.id,{additional_context:es.additionalContext})}/>
              <div className="text-[10px] text-[#bbb] mt-0.5">Auto-saves · included in all context pulls</div>
            </div>

            {/* Sheet URL 1 */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Linked Google Sheet 1</div>
              <div className="flex gap-2">
                <input className="input flex-1 text-xs"
                  placeholder="Paste Google Sheet URL…"
                  value={es.sheetUrl}
                  onChange={e=>setField(ws.id,'sheetUrl',e.target.value)}
                  onBlur={()=>updateWs(ws.id,{sheet_url:es.sheetUrl})}/>
                <button className="btn-secondary text-xs py-1.5 px-3 shrink-0"
                  disabled={!es.sheetUrl} onClick={()=>pullSheet(ws)}>
                  📊 Read
                </button>
              </div>
            </div>

            {/* Sheet URL 2 */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Linked Google Sheet 2 (optional)</div>
              <div className="flex gap-2">
                <input className="input flex-1 text-xs"
                  placeholder="Paste a second Google Sheet URL…"
                  value={es.sheetUrl2}
                  onChange={e=>setField(ws.id,'sheetUrl2',e.target.value)}
                  onBlur={()=>updateWs(ws.id,{sheet_url_2:es.sheetUrl2})}/>
                <button className="btn-secondary text-xs py-1.5 px-3 shrink-0"
                  disabled={!es.sheetUrl2} onClick={()=>pullSheet2(ws)}>
                  📊 Read
                </button>
              </div>
              <div className="text-[10px] text-[#bbb] mt-0.5">Both sheets added to raw context and included in Summarise</div>
            </div>

            {/* Pull buttons */}
            <div className="flex gap-2 flex-wrap">
              <button className="btn-secondary text-xs py-1.5 px-3" disabled={pulling===ws.id}
                onClick={()=>pullContext(ws)}>
                {pulling===ws.id?'🔍 Pulling…':'🔍 Drive & email'}
              </button>
              <button className="btn-secondary text-xs py-1.5 px-3" onClick={()=>pullSlack(ws)}>
                💬 Slack
              </button>
              <button className="text-xs py-1.5 px-3 rounded border-2 font-bold cursor-pointer"
                style={{borderColor:'#F4631E',color:'#F4631E',background:summarising===ws.id?'#FFF0E8':'white'}}
                disabled={summarising===ws.id} onClick={()=>summarise(ws)}>
                {summarising===ws.id?'Summarising…':'✦ Summarise'}
              </button>
            </div>

            {/* Raw context — collapsible, non-editable */}
            {ws.context_note&&(
              <details>
                <summary className="text-xs cursor-pointer font-medium select-none text-[#999]">
                  📎 Raw pulled context{ws.context_at?' · '+new Date(ws.context_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''} (click to view)
                </summary>
                <div className="mt-2 p-3 rounded-lg text-xs leading-relaxed whitespace-pre-line"
                  style={{background:'#F9F9F9',border:'1px solid #E5E5E5',color:'#555',userSelect:'none'}}>
                  {ws.context_note}
                </div>
              </details>
            )}

            {/* Editable briefing */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-[10px] font-mono uppercase tracking-widest" style={{color:'#F4631E'}}>
                  ✦ Weekly briefing{ws.briefing_at?' · updated '+new Date(ws.briefing_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''}
                </div>
                {briefingChanged&&(
                  <button className="text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer"
                    style={{background:'#F4631E',color:'white'}}
                    onClick={()=>updateWs(ws.id,{briefing:es.briefing,briefing_at:new Date().toISOString()})}>
                    Save
                  </button>
                )}
              </div>
              <textarea className="textarea text-sm leading-relaxed" rows={4}
                style={{background:'#FFF8F5',borderColor:briefingChanged?'#F4631E':'#FFD5C0'}}
                placeholder="Pull context then hit ✦ Summarise — or type your own briefing. You can also just use Additional Context above and hit Summarise without pulling from Drive/email."
                value={es.briefing}
                onChange={e=>setField(ws.id,'briefing',e.target.value)}
                onBlur={()=>{ if(briefingChanged) updateWs(ws.id,{briefing:es.briefing}) }}/>
              <div className="text-[10px] text-[#bbb] mt-0.5">Editable · auto-saves · flows into Weekly Agenda</div>
            </div>

            {/* Tagged notes */}
            {wsNotes.length>0&&(
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Notes ({wsNotes.length})</div>
                {wsNotes.map((n:any)=>(
                  <div key={n.id} className="flex items-start gap-2 py-1.5 border-b border-[#F5F5F5] last:border-0 text-sm">
                    <span style={{color:'#F4631E'}}>·</span>
                    <span className="flex-1">{n.content}</span>
                    {n.priority==='high'&&<span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{background:'#FFF0E8',color:'#F4631E'}}>!</span>}
                    <span className="text-xs text-[#ccc]">{new Date(n.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button className="btn-ghost text-xs" style={{color:'#DC2626'}} onClick={()=>deleteWs(ws.id)}>Delete workstream</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <AppNav>
      {/* Agenda banner */}
      <div className="rounded-lg px-5 py-4 mb-5 flex items-center gap-3 flex-wrap" style={{background:'#111',color:'white'}}>
        <div>
          <div className="text-xs font-mono uppercase tracking-widest mb-1" style={{color:'#F4631E'}}>Harry × George · Monday 4pm</div>
          <div className="font-bold text-sm">Briefings ready? Build your Weekly Agenda.</div>
        </div>
        <div className="flex-1"/>
        <button className="btn-primary font-bold" onClick={()=>router.push('/agenda')}>▶ Build Weekly Agenda</button>
      </div>

      {/* Top bar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div>
          <span className="text-sm font-bold">{activeWs.length} active workstream{activeWs.length!==1?'s':''}</span>
          {closedWs.length>0&&<span className="text-xs text-[#999] ml-2">· {closedWs.length} complete/archived</span>}
        </div>
        <div className="flex-1"/>
        <button className="btn-secondary text-xs" disabled={savingAll} onClick={saveAllToSheet}>
          {savingAll?'Saving…':'📊 Save all to this week\'s Sheet'}
        </button>
        <button className="btn-primary font-bold" onClick={()=>setCreating(c=>!c)}>+ New workstream</button>
      </div>

      {/* Create form */}
      {creating&&(
        <div className="card mb-5">
          <div className="font-black text-base mb-3">New workstream</div>
          <input className="input mb-2" placeholder="Name (e.g. Snowboxx 2026)" value={draft.name} autoFocus
            onChange={e=>setDraft({...draft,name:e.target.value})} onKeyDown={e=>e.key==='Enter'&&createWs()}/>
          <div className="flex gap-2 mb-2 flex-wrap">
            <select className="select" value={draft.cat_id} onChange={e=>setDraft({...draft,cat_id:e.target.value})}>{CATS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select className="select" value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>{WS_ST.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <input className="input w-28" placeholder="Owner" value={draft.owner} onChange={e=>setDraft({...draft,owner:e.target.value})}/>
            <input type="date" className="input w-36" value={draft.deadline} onChange={e=>setDraft({...draft,deadline:e.target.value})}/>
          </div>
          <input className="input mb-2" placeholder="Drive link" value={draft.link} onChange={e=>setDraft({...draft,link:e.target.value})}/>
          <textarea className="textarea mb-3" rows={2} placeholder="Background notes" value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={()=>setCreating(false)}>Cancel</button>
            <button className="btn-primary font-bold" disabled={!draft.name.trim()} onClick={createWs}>Create</button>
          </div>
        </div>
      )}

      {/* Active workstreams */}
      {activeWs.length===0?(
        <div className="text-center py-16">
          <div className="text-3xl mb-3">⚡</div>
          <div className="font-black text-lg mb-2">No active workstreams</div>
          <div className="text-sm text-[#999]">Create one above or add one from the Notes tab.</div>
        </div>
      ):CATS.map(cat=>{
        const items=activeByCat[cat.id]; if(!items?.length) return null
        return(
          <div key={cat.id} className="mb-7">
            <div className="flex items-center gap-2 mb-3 pb-2" style={{borderBottom:`2px solid ${cat.color}44`}}>
              <span className="w-3 h-3 rounded-full" style={{background:cat.color}}/>
              <span className="font-black text-base uppercase tracking-wide">{cat.name}</span>
              <span className="text-xs text-[#999]">{items.length}</span>
            </div>
            {items.map(renderWsCard)}
          </div>
        )
      })}

      {/* Complete/Archived */}
      {closedWs.length>0&&(
        <div className="mt-4">
          <button className="flex items-center gap-2 text-sm text-[#999] font-medium mb-3 cursor-pointer hover:text-black"
            onClick={()=>setShowClosed(s=>!s)}>
            {showClosed?'▾':'▸'} Complete & Archived ({closedWs.length})
          </button>
          {showClosed&&CATS.map(cat=>{
            const items=closedByCat[cat.id]; if(!items?.length) return null
            return(
              <div key={cat.id} className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#ccc]"/>
                  <span className="text-sm font-bold text-[#999] uppercase tracking-wide">{cat.name}</span>
                </div>
                {items.map(renderWsCard)}
              </div>
            )
          })}
        </div>
      )}

      {toast&&(
        <div className="fixed bottom-5 right-5 px-4 py-3 rounded-lg text-sm font-medium shadow-lg z-50 max-w-sm"
          style={{background:'#111',color:'white'}}>
          {toast}
        </div>
      )}
    </AppNav>
  )
}
