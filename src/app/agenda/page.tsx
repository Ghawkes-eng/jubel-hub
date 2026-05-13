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

const CONTACTS = [
  { id:'harry', name:'Harry',  email:'harry@jubelbeer.com',  role:'Manager'                    },
  { id:'tash',  name:'Tash',   email:'tash@jubelbeer.com',   role:'Festivals & Events Manager'  },
  { id:'alex',  name:'Alex',   email:'alex@jubelbeer.com',   role:'Festivals & Events Manager'  },
  { id:'emily', name:'Emily',  email:'emily@jubelbeer.com',  role:'Music & Culture'             },
  { id:'sam',   name:'Sam',    email:'samw@jubelbeer.com',   role:'Brand Events & Activations'  },
]

type Phase = 'select' | 'build' | 'active' | 'wrapup'

type AdHocItem = {
  id: string
  title: string
  notes: string
  actions: Array<{id:string,content:string,owner:string,done:boolean}>
  disposition: 'none' | 'existing-ws' | 'new-ws'
  targetWsId: string
  newWsCatId: string
}

export default function AgendaPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [workstreams, setWorkstreams] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<Phase>('select')
  const [loading, setLoading] = useState(true)

  // Meeting state
  const [meetingNotes, setMeetingNotes] = useState<Record<string,string>>({})
  const [wsActions, setWsActions] = useState<Record<string, Array<{id:string,content:string,owner:string,done:boolean}>>>({})
  const [adHocItems, setAdHocItems] = useState<AdHocItem[]>([])
  const [newAdHocTitle, setNewAdHocTitle] = useState('')
  const [showAddAdHoc, setShowAddAdHoc] = useState(false)

  // Wrap-up state
  const [summary, setSummary] = useState('')
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncDone, setSyncDone] = useState(false)
  const [draftingEmail, setDraftingEmail] = useState(false)
  const [emailDone, setEmailDone] = useState(false)

  const [selectedContact, setSelectedContact] = useState<typeof CONTACTS[0] | null>(null)
  const [toast, setToast] = useState<string|null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
    if (status === 'authenticated') fetchData()
  }, [status])

  function showToast(msg: string) { setToast(msg); setTimeout(()=>setToast(null),4500) }

  async function fetchData() {
    const [wsRes, notesRes] = await Promise.all([fetch('/api/workstreams'), fetch('/api/notes')])
    if (wsRes.ok) setWorkstreams(await wsRes.json())
    if (notesRes.ok) setNotes((await notesRes.json()).filter((n:any)=>!n.consumed))
    setLoading(false)
  }

  function toggleWs(id: string) {
    setSelected(s=>{const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n})
  }

  const selectedWs = workstreams.filter(w=>selected.has(w.id))
  const activeWs   = workstreams.filter(w=>w.status==='active'||w.status==='blocked')

  // ── Actions helpers ──
  function addWsAction(wsId: string, content: string, owner: string) {
    setWsActions(prev=>({...prev,[wsId]:[...(prev[wsId]||[]),{id:Math.random().toString(36).slice(2),content,owner:owner||'Me',done:false}]}))
  }
  function toggleWsAction(wsId: string, aId: string) {
    setWsActions(prev=>({...prev,[wsId]:(prev[wsId]||[]).map(a=>a.id===aId?{...a,done:!a.done}:a)}))
  }

  // ── Ad-hoc helpers ──
  function addAdHoc() {
    if (!newAdHocTitle.trim()) return
    const item: AdHocItem = {
      id: Math.random().toString(36).slice(2),
      title: newAdHocTitle.trim(),
      notes: '', actions: [],
      disposition: 'none', targetWsId: '', newWsCatId: 'festivals'
    }
    setAdHocItems(prev=>[...prev,item])
    setNewAdHocTitle(''); setShowAddAdHoc(false)
  }
  function updateAdHoc(id: string, patch: Partial<AdHocItem>) {
    setAdHocItems(prev=>prev.map(i=>i.id===id?{...i,...patch}:i))
  }
  function addAdHocAction(itemId: string, content: string, owner: string) {
    setAdHocItems(prev=>prev.map(i=>i.id===itemId?{...i,actions:[...i.actions,{id:Math.random().toString(36).slice(2),content,owner:owner||'Me',done:false}]}:i))
  }

  // ── Complete meeting → Wrap Up ──
  async function completeMeeting() {
    setPhase('wrapup')
    setGeneratingSummary(true)
    showToast('Generating summary…')

    // Build text summary for AI
    const sections = selectedWs.map(ws => {
      const wNotes = meetingNotes[ws.id] || ''
      const wActions = (wsActions[ws.id]||[]).map(a=>`- ${a.done?'[x]':'[ ]'} ${a.owner}: ${a.content}`).join('\n')
      const taggedNotes = notes.filter(n=>n.ws_id===ws.id).map(n=>`- ${n.content}`).join('\n')
      return `${ws.name}:\n${ws.briefing?'Briefing: '+ws.briefing:''}${taggedNotes?'\nNotes: '+taggedNotes:''}${wNotes?'\nMeeting notes: '+wNotes:''}${wActions?'\nActions:\n'+wActions:''}`
    }).join('\n\n')

    const adHocText = adHocItems.length ? '\n\nAd-hoc discussions:\n' + adHocItems.map(i=>`${i.title}: ${i.notes}`).join('\n') : ''

    const res = await fetch('/api/ai/generate-summary', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ content: sections + adHocText,contactName: selectedContact?.name || 'Harry', date: new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}) })
    })
    const d = await res.json()
    if (d.text) setSummary(d.text)
    else setSummary('No summary generated — write your own above.')
    setGeneratingSummary(false)
  }

  // ── Sync to Sheet ──
  async function syncToSheet() {
    const accessToken = (session as any)?.user?.gToken
    if (!accessToken) { showToast('No Google access token — sign out and back in'); return }
    setSyncing(true); showToast('Syncing to Sheet…')

    const weekLabel = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
    const SHEET_ID = '1WVmXCL9mf7zLCT-gRtBCyUu9A7xLlPikkJ5lYYsbuXc'
    const tabName = `Catchup ${weekLabel}`

    const rows: string[][] = [
      [`Weekly Catch-up — ${weekLabel}`],
      ['Summary', summary],
      [''],
      ['WORKSTREAM','MEETING NOTES','ACTIONS'],
    ]
    selectedWs.forEach(ws=>{
      const actions = (wsActions[ws.id]||[]).map(a=>`${a.done?'✓':'-'} ${a.owner}: ${a.content}`).join('; ')
      rows.push([ws.name, meetingNotes[ws.id]||'', actions])
    })
    if (adHocItems.length) {
      rows.push([''],['AD-HOC DISCUSSIONS','NOTES',''])
      adHocItems.forEach(i=>rows.push([i.title, i.notes, '']))
    }
    rows.push([''],['ALL ACTIONS','OWNER','STATUS'])
    selectedWs.forEach(ws=>{
      (wsActions[ws.id]||[]).forEach(a=>rows.push([a.content, a.owner, a.done?'Done':'Open']))
    })
    adHocItems.forEach(i=>i.actions.forEach(a=>rows.push([a.content, a.owner, a.done?'Done':'Open'])))

    try {
      const auth = `Bearer ${accessToken}`
      try {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
          method:'POST', headers:{'Authorization':auth,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{addSheet:{properties:{title:tabName}}}]})
        })
      } catch(e) {}

      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}!A1?valueInputOption=RAW`,
        { method:'PUT', headers:{'Authorization':auth,'Content-Type':'application/json'},
          body:JSON.stringify({values:rows}) }
      )
      if (updateRes.ok) { setSyncDone(true); showToast('✓ Synced to Sheet') }
      else { const e=await updateRes.json(); showToast('Sheet error: '+(e?.error?.message||'unknown')) }
    } catch(e:any) { showToast('Sync failed: '+e.message) }
    setSyncing(false)
  }

  // ── Draft email ──
  async function draftEmail() {
    setDraftingEmail(true); showToast('Drafting email…')
    const allActions = [
      ...selectedWs.flatMap(ws=>(wsActions[ws.id]||[]).map(a=>({...a,ws:ws.name}))),
      ...adHocItems.flatMap(i=>i.actions.map(a=>({...a,ws:i.title}))),
    ]
    const res = await fetch('/api/ai/draft-email', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        summary,
        date: new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}),
        workstreams: selectedWs.map(ws=>({ name:ws.name, notes:meetingNotes[ws.id]||'' })),
        adHocItems: adHocItems.map(i=>({title:i.title,notes:i.notes})),
        actions: allActions,
        harryEmail: selectedContact?.email || 'harry@jubelbeer.com',
        contactName: selectedContact?.name || 'Harry',
        myEmail: 'george@jubelbeer.com',
        myName: 'George',
      })
    })
    const d = await res.json()
    if (d.error) showToast('Email draft failed: '+d.error)
    else { setEmailDone(true); showToast('✓ Email draft saved to Gmail — check Drafts to review and send') }
    setDraftingEmail(false)
  }

  // ── Route ad-hoc items after meeting ──
  async function routeAdHocItem(item: AdHocItem) {
    if (item.disposition === 'new-ws') {
      await fetch('/api/workstreams', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ name:item.title, cat_id:item.newWsCatId, status:'active', owner:'Me', notes:item.notes })
      })
      showToast(`✓ Created workstream "${item.title}"`)
    } else if (item.disposition === 'existing-ws' && item.targetWsId) {
      await fetch('/api/notes', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ content:item.title+(item.notes?' — '+item.notes:''), ws_id:item.targetWsId, cat_id:'aob', priority:'normal' })
      })
      const ws = workstreams.find(w=>w.id===item.targetWsId)
      showToast(`✓ Added to workstream "${ws?.name}"`)
    }
  }

  if (loading) return <AppNav><div className="flex items-center justify-center h-64 text-[#999]">Loading…</div></AppNav>

  // ── SELECT PHASE ──────────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <AppNav>
        <div className="max-w-2xl">
          <div className="mb-6">
            <div className="text-xs font-mono uppercase tracking-widest mb-1" style={{color:'#F4631E'}}>Weekly Agenda</div>
            <h1 className="text-2xl font-black mb-1">Who is this catch-up with?</h1>
            <p className="text-sm text-[#999]">Select the person, then choose your workstreams for this week.</p>
          </div>

          {/* Contact selector */}
          {!selectedContact ? (
            <div className="mb-8">
              <div className="flex flex-wrap gap-3">
                {CONTACTS.map(c=>(
                  <button key={c.id}
                    onClick={()=>setSelectedContact(c)}
                    className="flex flex-col items-center px-6 py-4 rounded-xl border-2 font-medium cursor-pointer transition-all hover:border-[#F4631E] hover:bg-[#FFF8F5]"
                    style={{background:'white',borderColor:'#E5E5E5',minWidth:120}}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-black text-white mb-2"
                      style={{background:'#111'}}>{c.name[0]}</div>
                    <div className="text-sm font-bold">{c.name}</div>
                    <div className="text-[10px] text-[#999] text-center mt-0.5">{c.role}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Selected contact — shown once chosen */}
              <div className="flex items-center gap-3 mb-6 p-3 rounded-lg"
                style={{background:'#111',color:'white'}}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black"
                  style={{background:'#F4631E'}}>{selectedContact.name[0]}</div>
                <div>
                  <div className="font-bold text-sm">Catch-up with {selectedContact.name}</div>
                  <div className="text-xs" style={{color:'#999'}}>{selectedContact.email}</div>
                </div>
                <button className="ml-auto text-xs text-[#999] hover:text-white cursor-pointer bg-transparent border-none"
                  onClick={()=>setSelectedContact(null)}>Change</button>
              </div>

              <div className="mb-4">
                <h2 className="text-lg font-black mb-1">What are we covering?</h2>
                <p className="text-sm text-[#999]">Select workstreams — briefings and tagged notes flow in automatically. ✦ = briefing saved.</p>
              </div>

          {activeWs.length === 0 ? (
            <div className="card text-center py-10">
              <div className="font-bold mb-2">No active workstreams yet</div>
              <button className="btn-primary" onClick={()=>router.push('/workstreams')}>Go to Workstreams →</button>
            </div>
          ) : (
            <>
              {CATS.map(cat=>{
                const catWs=activeWs.filter(w=>w.cat_id===cat.id); if(!catWs.length) return null
                return(
                  <div key={cat.id} className="mb-5">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{background:cat.color}}/>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#999]">{cat.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {catWs.map(ws=>{
                        const isSel=selected.has(ws.id)
                        const noteCount=notes.filter(n=>n.ws_id===ws.id).length
                        return(
                          <button key={ws.id} onClick={()=>toggleWs(ws.id)}
                            className="text-sm px-4 py-2 rounded-lg border-2 transition-all font-medium cursor-pointer"
                            style={{background:isSel?'#111':'white',borderColor:isSel?'#111':'#E5E5E5',color:isSel?'white':'#111'}}>
                            {isSel?'✓ ':''}{ws.name}
                            {ws.briefing&&<span className="ml-1.5" style={{color:isSel?'#F4631E':'#F4631E'}}>✦</span>}
                            {noteCount>0&&<span className="ml-1.5 opacity-60">({noteCount})</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {notes.filter(n=>!n.ws_id).length>0&&(
                <div className="text-xs text-[#999] mb-4 p-3 bg-white rounded-lg border border-[#E5E5E5]">
                  {notes.filter(n=>!n.ws_id).length} untagged note{notes.filter(n=>!n.ws_id).length!==1?'s':''} will appear under AOB
                </div>
              )}

              <div className="flex items-center gap-3 mt-6">
                <button className="btn-primary px-6 py-2.5 text-base font-black"
                  disabled={selected.size===0} onClick={()=>setPhase('build')}>
                  Build Agenda with {selectedContact.name} ({selected.size} workstream{selected.size!==1?'s':''}) →
                </button>
                <span className="text-xs text-[#999]">✦ briefed · (n) notes queued</span>
              </div>
            </>
          )}
        </>
        )}
        </div>
      </AppNav>
    )
  }

  const untaggedNotes = notes.filter(n=>!n.ws_id)

  // ── WRAP-UP PHASE ─────────────────────────────────────────────────────────
  if (phase === 'wrapup') {
    const allActions = [
      ...selectedWs.flatMap(ws=>(wsActions[ws.id]||[]).map(a=>({...a,ws:ws.name}))),
      ...adHocItems.flatMap(i=>i.actions.map(a=>({...a,ws:i.title}))),
    ]
    const openActions = allActions.filter(a=>!a.done)

    return (
      <AppNav>
        <div style={{background:'#111',color:'white'}} className="rounded-lg px-5 py-4 mb-5 flex items-center gap-3 flex-wrap">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest mb-1" style={{color:'#F4631E'}}>Meeting complete</div>
            <div className="font-black text-lg">
            {selectedContact ? `Catch-up with ${selectedContact.name}` : 'Weekly Agenda'} · {new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}
          </div>
          </div>
          <div className="flex-1"/>
          <div className="flex gap-2 flex-wrap">
            <button className="btn-secondary text-sm" disabled={syncing} onClick={syncToSheet}>
              {syncing?'Syncing…':syncDone?'✓ Sheet synced':'📊 Sync to Sheet'}
            </button>
            <button className="btn-primary font-bold text-sm" disabled={draftingEmail} onClick={draftEmail}>
              {draftingEmail?'Drafting…':emailDone?'✉ Draft saved':'✉ `✉ Draft email to ${selectedContact?.name || 'Harry'}`}
            </button>
          </div>
        </div>

        {/* AI Summary */}
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{color:'#F4631E'}}>✦ Meeting summary</div>
            {generatingSummary&&<span className="text-xs text-[#999]">Generating…</span>}
          </div>
          <textarea className="textarea leading-relaxed" rows={6}
            style={{background:'#FFF8F5',borderColor:'#FFD5C0'}}
            placeholder={generatingSummary?'Generating summary…':'Write or edit your meeting summary here…'}
            value={summary} onChange={e=>setSummary(e.target.value)}/>
          <div className="text-[10px] text-[#bbb] mt-1">Editable — this is what gets emailed to Harry and synced to Sheet</div>
        </div>

        {/* Actions summary */}
        {allActions.length>0&&(
          <div className="card mb-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-3">
              Actions — {openActions.length} open / {allActions.length} total
            </div>
            {allActions.map(a=>(
              <div key={a.id} className="flex items-start gap-2 py-2 border-b border-[#F5F5F5] last:border-0">
                <div className="w-4 h-4 rounded border-2 mt-0.5 flex items-center justify-center shrink-0"
                  style={{borderColor:a.done?'#2D6A4F':'#999',background:a.done?'#2D6A4F':'white'}}>
                  {a.done&&<span className="text-white text-[10px] font-black">✓</span>}
                </div>
                <div className="flex-1">
                  <div className={`text-sm ${a.done?'line-through text-[#999]':''}`}>{a.content}</div>
                  <div className="text-xs text-[#999]">{a.owner} · {a.ws}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ad-hoc routing */}
        {adHocItems.filter(i=>i.disposition!=='none').length>0&&(
          <div className="card mb-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-3">Route ad-hoc discussions</div>
            {adHocItems.filter(i=>i.disposition!=='none').map(item=>(
              <div key={item.id} className="flex items-center gap-2 py-2 border-b border-[#F5F5F5] last:border-0">
                <span className="text-sm flex-1 font-medium">{item.title}</span>
                <span className="text-xs text-[#999]">
                  {item.disposition==='new-ws'?`→ New workstream (${CATS.find(c=>c.id===item.newWsCatId)?.name})`:
                   item.disposition==='existing-ws'?`→ ${workstreams.find(w=>w.id===item.targetWsId)?.name||'workstream'}`:''}
                </span>
                <button className="btn-primary text-xs py-1 px-3" onClick={()=>routeAdHocItem(item)}>Apply</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button className="btn-secondary text-sm" onClick={()=>{ setPhase('select'); setSelected(new Set()); setSelectedContact(null); setMeetingNotes({}); setWsActions({}); setAdHocItems([]); setSummary(''); setSyncDone(false); setEmailDone(false) }}>
            ← Start new agenda
          </button>
        </div>
      </AppNav>
    )
  }

  // ── BUILD / ACTIVE PHASE ──────────────────────────────────────────────────
  return (
    <AppNav>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest mb-0.5"
            style={{color:phase==='active'?'#F4631E':'#999'}}>
            {phase==='build'?'Building agenda':'🔴 Meeting in progress'}
          </div>
          <h1 className="text-xl font-black">
            {selectedContact?.name ? `Catch-up with ${selectedContact.name}` : 'Weekly Agenda'} · {new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
          </h1>
        </div>
        <div className="flex-1"/>
        <button className="btn-ghost text-xs" onClick={()=>setPhase('select')}>← Change selection</button>
        {phase==='build'&&(
          <button className="btn-primary font-black" onClick={()=>setPhase('active')}>▶ Start Meeting</button>
        )}
        {phase==='active'&&(
          <button className="font-bold px-4 py-2 rounded text-sm text-white cursor-pointer"
            style={{background:'#111'}}
            onClick={()=>{ if(window.confirm('Complete this meeting?\n\nThis will generate a summary and take you to the wrap-up screen.')) completeMeeting() }}>
            ✓ Complete Meeting
          </button>
        )}
      </div>

      {/* Phase hint */}
      {phase==='build'&&(
        <div className="p-3 rounded-lg mb-4 text-sm" style={{background:'#F5F5F5',borderLeft:'3px solid #111'}}>
          <strong>Build phase</strong> — review briefings and notes. Hit ▶ Start Meeting when you sit down with Harry.
        </div>
      )}
      {phase==='active'&&(
        <div className="p-3 rounded-lg mb-4 text-sm" style={{background:'#FFF0E8',borderLeft:'3px solid #F4631E'}}>
          <strong style={{color:'#F4631E'}}>Meeting live</strong> — add notes as you discuss. Use <strong>+ Add discussion</strong> below if Harry raises something new. Hit ✓ Complete when done.
        </div>
      )}

      {/* Workstream cards by category */}
      {CATS.map(cat=>{
        const catWs=selectedWs.filter(w=>w.cat_id===cat.id); if(!catWs.length) return null
        return(
          <div key={cat.id} className="mb-6">
            <div className="flex items-center gap-2 mb-3 pb-2" style={{borderBottom:`2px solid ${cat.color}44`}}>
              <span className="w-3 h-3 rounded-full" style={{background:cat.color}}/>
              <span className="font-black text-base uppercase tracking-wide">{cat.name}</span>
            </div>
            {catWs.map(ws=>{
              const wsNotes=notes.filter(n=>n.ws_id===ws.id)
              return(
                <WorkstreamCard key={ws.id} ws={ws} cat={cat} wsNotes={wsNotes} phase={phase}
                  meetingNotes={meetingNotes[ws.id]||''}
                  onUpdateNotes={(v:string)=>setMeetingNotes(m=>({...m,[ws.id]:v}))}
                  actions={wsActions[ws.id]||[]}
                  onAddAction={(c:string,o:string)=>addWsAction(ws.id,c,o)}
                  onToggleAction={(aid:string)=>toggleWsAction(ws.id,aid)}/>
              )
            })}
          </div>
        )
      })}

      {/* AOB — untagged notes */}
      {untaggedNotes.length>0&&(
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 pb-2" style={{borderBottom:'2px solid #5a555033'}}>
            <span className="w-3 h-3 rounded-full bg-[#5A5550]"/>
            <span className="font-black text-base uppercase tracking-wide">AOB</span>
          </div>
          <div className="card" style={{borderLeft:'4px solid #5A5550'}}>
            {untaggedNotes.map(n=>(
              <div key={n.id} className="flex items-start gap-2 text-sm py-1.5 border-b border-[#F5F5F5] last:border-0">
                <span className="text-[#ddd]">·</span><span className="flex-1">{n.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ad-hoc discussions */}
      {(adHocItems.length>0||phase==='active')&&(
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 pb-2" style={{borderBottom:'2px solid #F4631E44'}}>
            <span className="w-3 h-3 rounded-full" style={{background:'#F4631E'}}/>
            <span className="font-black text-base uppercase tracking-wide">Ad-hoc discussions</span>
            <span className="text-xs text-[#999]">{selectedContact?.name || 'Harry'} raised these during the meeting</span>
          </div>

          {adHocItems.map(item=>(
            <AdHocCard key={item.id} item={item} phase={phase} workstreams={workstreams}
              onUpdate={(patch:Partial<AdHocItem>)=>updateAdHoc(item.id,patch)}
              onAddAction={(c:string,o:string)=>addAdHocAction(item.id,c,o)}/>
          ))}

          {phase==='active'&&(
            showAddAdHoc?(
              <div className="card" style={{borderLeft:'4px solid #F4631E'}}>
                <div className="text-xs font-mono uppercase tracking-widest text-[#999] mb-2">New discussion topic</div>
                <input className="input mb-2" autoFocus placeholder="What did Harry raise?"
                  value={newAdHocTitle} onChange={e=>setNewAdHocTitle(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter') addAdHoc(); if(e.key==='Escape') setShowAddAdHoc(false)}}/>
                <div className="flex gap-2 justify-end">
                  <button className="btn-ghost text-xs" onClick={()=>setShowAddAdHoc(false)}>Cancel</button>
                  <button className="btn-primary text-xs font-bold" disabled={!newAdHocTitle.trim()} onClick={addAdHoc}>Add</button>
                </div>
              </div>
            ):(
              <button className="w-full py-3 rounded-lg border-2 border-dashed text-sm font-medium transition-colors cursor-pointer"
                style={{borderColor:'#F4631E44',color:'#F4631E'}}
                onClick={()=>setShowAddAdHoc(true)}>
                + Add discussion (Harry raised something new)
              </button>
            )
          )}
        </div>
      )}

      {toast&&(
        <div className="fixed bottom-5 right-5 px-4 py-3 rounded-lg text-sm font-medium shadow-lg z-50 max-w-sm"
          style={{background:'#111',color:'white'}}>{toast}</div>
      )}
    </AppNav>
  )
}

// ── Workstream card component ─────────────────────────────────────────────────

function WorkstreamCard({ ws, cat, wsNotes, phase, meetingNotes, onUpdateNotes, actions, onAddAction, onToggleAction }: any) {
  const [newAction, setNewAction] = useState('')
  const [newOwner, setNewOwner] = useState('Me')
  const [showAddAction, setShowAddAction] = useState(false)

  return (
    <div className="card mb-3" style={{borderLeft:`4px solid ${cat.color}`}}>
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            {ws.deadline&&<span className="text-xs text-[#999]">⏱ {new Date(ws.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
            {ws.owner&&<span className="text-xs text-[#999]">👤 {ws.owner}</span>}
            {ws.link&&<a href={ws.link} target="_blank" rel="noreferrer" className="text-xs no-underline" style={{color:'#F4631E'}}>↗ Drive</a>}
          </div>
          <h3 className="font-black text-lg">{ws.name}</h3>
        </div>
      </div>

      {/* Briefing */}
      {ws.briefing?(
        <div className="rounded-lg p-3 mb-3" style={{background:'#FFF8F5',border:'1px solid #FFD5C0'}}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{color:'#F4631E'}}>✦ Briefing</div>
          <div className="text-sm leading-relaxed whitespace-pre-line">{ws.briefing}</div>
        </div>
      ):(
        <div className="rounded-lg p-3 mb-3 text-xs text-[#999] italic" style={{background:'#F9F9F9',border:'1px solid #E5E5E5'}}>
          No briefing — update on the Workstreams tab.
        </div>
      )}

      {/* Tagged notes */}
      {wsNotes.length>0&&(
        <div className="mb-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Notes this week</div>
          {wsNotes.map((n:any)=>(
            <div key={n.id} className="flex items-start gap-2 text-sm py-1.5 border-b border-[#F5F5F5] last:border-0">
              <span style={{color:'#F4631E'}}>·</span>
              <span className="flex-1">{n.content}</span>
              {n.priority==='high'&&<span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{background:'#FFF0E8',color:'#F4631E'}}>!</span>}
            </div>
          ))}
        </div>
      )}

      {/* Live meeting notes */}
      {(phase==='active')&&(
        <div className="mb-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Meeting notes</div>
          <textarea className="textarea text-sm" rows={3}
            style={{background:'#FFFDF5',borderColor:'#F4631E44'}}
            placeholder="Capture what you discuss — decisions, context, next steps…"
            value={meetingNotes} onChange={e=>onUpdateNotes(e.target.value)}/>
        </div>
      )}

      {/* Actions */}
      {(actions.length>0||phase==='active')&&(
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Actions</div>
          {actions.map((a:any)=>(
            <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-[#F5F5F5] last:border-0">
              <div className="w-4 h-4 rounded border-2 cursor-pointer flex items-center justify-center shrink-0"
                style={{borderColor:a.done?'#2D6A4F':'#999',background:a.done?'#2D6A4F':'white'}}
                onClick={()=>onToggleAction(a.id)}>
                {a.done&&<span className="text-white text-[10px] font-black">✓</span>}
              </div>
              <span className={`text-sm flex-1 ${a.done?'line-through text-[#999]':''}`}>{a.content}</span>
              <span className="text-xs text-[#999]">{a.owner}</span>
            </div>
          ))}
          {phase==='active'&&(
            showAddAction?(
              <div className="flex gap-2 mt-2">
                <input className="input flex-1 text-xs" autoFocus placeholder="Action…"
                  value={newAction} onChange={e=>setNewAction(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&newAction.trim()){onAddAction(newAction,newOwner);setNewAction('');setShowAddAction(false)}}}/>
                <input className="input w-20 text-xs" placeholder="Owner" value={newOwner} onChange={e=>setNewOwner(e.target.value)}/>
                <button className="btn-primary text-xs" disabled={!newAction.trim()}
                  onClick={()=>{onAddAction(newAction,newOwner);setNewAction('');setShowAddAction(false)}}>Add</button>
                <button className="btn-ghost text-xs" onClick={()=>setShowAddAction(false)}>×</button>
              </div>
            ):(
              <button className="btn-ghost text-xs mt-1" onClick={()=>setShowAddAction(true)}>+ Add action</button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── Ad-hoc discussion card ────────────────────────────────────────────────────

function AdHocCard({ item, phase, workstreams, onUpdate, onAddAction }: any) {
  const [newAction, setNewAction] = useState('')
  const [newOwner, setNewOwner] = useState('Me')
  const [showAddAction, setShowAddAction] = useState(false)

  const CATS = [
    { id:'festivals', name:'Festivals & Events', color:'#2D6A4F' },
    { id:'sports',    name:'Sports & Lifestyle', color:'#B5712A' },
    { id:'music',     name:'Music & Culture',    color:'#6A4E89' },
    { id:'brand',     name:'Brand Events',       color:'#9B740A' },
    { id:'aob',       name:'AOB',                color:'#5A5550' },
  ]
  const activeWs = workstreams.filter((w:any)=>w.status==='active'||w.status==='blocked')

  return (
    <div className="card mb-3" style={{borderLeft:'4px solid #F4631E'}}>
      <h3 className="font-black text-base mb-3" style={{color:'#F4631E'}}>{item.title}</h3>

      {/* Notes */}
      <div className="mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-1.5">Notes</div>
        <textarea className="textarea text-sm" rows={2}
          style={{background:'#FFF8F5',borderColor:'#F4631E44'}}
          placeholder="Notes from this discussion…"
          value={item.notes} onChange={e=>onUpdate({notes:e.target.value})}/>
      </div>

      {/* Actions */}
      {item.actions.map((a:any)=>(
        <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-[#F5F5F5] last:border-0 text-sm">
          <span style={{color:'#F4631E'}}>·</span><span className="flex-1">{a.content}</span>
          <span className="text-xs text-[#999]">{a.owner}</span>
        </div>
      ))}
      {showAddAction?(
        <div className="flex gap-2 mt-2 mb-3">
          <input className="input flex-1 text-xs" autoFocus placeholder="Action…"
            value={newAction} onChange={e=>setNewAction(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&newAction.trim()){onAddAction(newAction,newOwner);setNewAction('');setShowAddAction(false)}}}/>
          <input className="input w-20 text-xs" placeholder="Owner" value={newOwner} onChange={e=>setNewOwner(e.target.value)}/>
          <button className="btn-primary text-xs" disabled={!newAction.trim()}
            onClick={()=>{onAddAction(newAction,newOwner);setNewAction('');setShowAddAction(false)}}>Add</button>
          <button className="btn-ghost text-xs" onClick={()=>setShowAddAction(false)}>×</button>
        </div>
      ):(
        <button className="btn-ghost text-xs mb-3" onClick={()=>setShowAddAction(true)}>+ Add action</button>
      )}

      {/* Route this discussion */}
      <div className="border-t border-[#F5F5F5] pt-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-2">After the meeting, route this to:</div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name={`disp-${item.id}`} checked={item.disposition==='none'}
              onChange={()=>onUpdate({disposition:'none'})} style={{accentColor:'#F4631E'}}/>
            Keep as standalone note only
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name={`disp-${item.id}`} checked={item.disposition==='new-ws'}
              onChange={()=>onUpdate({disposition:'new-ws'})} style={{accentColor:'#F4631E'}} className="mt-0.5"/>
            <div className="flex-1">
              <span className="text-sm">Create new workstream</span>
              {item.disposition==='new-ws'&&(
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {CATS.map((cat:any)=>(
                    <button key={cat.id}
                      className="text-xs px-2.5 py-1 rounded-lg border-2 font-medium cursor-pointer transition-all"
                      style={{background:item.newWsCatId===cat.id?cat.color:'white',borderColor:item.newWsCatId===cat.id?cat.color:'#E5E5E5',color:item.newWsCatId===cat.id?'white':'#333'}}
                      onClick={()=>onUpdate({newWsCatId:cat.id})}>
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name={`disp-${item.id}`} checked={item.disposition==='existing-ws'}
              onChange={()=>onUpdate({disposition:'existing-ws'})} style={{accentColor:'#F4631E'}} className="mt-0.5"/>
            <div className="flex-1">
              <span className="text-sm">Add to existing workstream</span>
              {item.disposition==='existing-ws'&&(
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {activeWs.map((ws:any)=>(
                    <button key={ws.id}
                      className="text-xs px-2.5 py-1 rounded-lg border-2 font-medium cursor-pointer transition-all"
                      style={{background:item.targetWsId===ws.id?'#111':'white',borderColor:item.targetWsId===ws.id?'#111':'#E5E5E5',color:item.targetWsId===ws.id?'white':'#333'}}
                      onClick={()=>onUpdate({targetWsId:ws.id})}>
                      {ws.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
        </div>
      </div>
    </div>
  )
}
