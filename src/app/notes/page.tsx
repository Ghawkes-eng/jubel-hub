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

type NoteAction = 'none' | 'new-workstream' | 'existing-workstream'

type NoteState = {
  action: NoteAction
  newWsCategory: string
  existingWsId: string
  editing: boolean
  editContent: string
  saving: boolean
}

export default function NotesPage() {
  const { status } = useSession()
  const router = useRouter()
  const [notes, setNotes] = useState<any[]>([])
  const [workstreams, setWorkstreams] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [priority, setPriority] = useState('normal')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [noteStates, setNoteStates] = useState<Record<string, NoteState>>({})
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
    if (status === 'authenticated') { fetchNotes(); fetchWorkstreams() }
  }, [status])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  async function fetchNotes() {
    const res = await fetch('/api/notes')
    if (res.ok) setNotes(await res.json())
    setLoading(false)
  }

  async function fetchWorkstreams() {
    const res = await fetch('/api/workstreams')
    if (res.ok) setWorkstreams(await res.json())
  }

  function getNoteState(id: string): NoteState {
    return noteStates[id] || { action:'none', newWsCategory:'festivals', existingWsId:'', editing:false, editContent:'', saving:false }
  }

  function setNoteState(id: string, patch: Partial<NoteState>) {
    setNoteStates(prev => ({ ...prev, [id]: { ...getNoteState(id), ...patch } }))
  }

  async function addNote() {
    if (!input.trim()) return
    setAdding(true)
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input.trim(), cat_id: 'aob', priority }),
    })
    setInput(''); setPriority('normal')
    fetchNotes()
    setAdding(false)
  }

  async function saveEdit(note: any) {
    const ns = getNoteState(note.id)
    if (!ns.editContent.trim()) return
    setNoteState(note.id, { saving: true })
    await fetch(`/api/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: ns.editContent.trim() }),
    })
    setNoteState(note.id, { saving: false, editing: false, editContent: '' })
    fetchNotes()
  }

  async function handleDone(note: any) {
    const ns = getNoteState(note.id)
    setNoteState(note.id, { saving: true })

    try {
      if (ns.action === 'new-workstream') {
        // Create a new workstream from this note
        const cat = CATS.find(c => c.id === ns.newWsCategory)
        await fetch('/api/workstreams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: note.content,
            cat_id: ns.newWsCategory,
            status: 'active',
            owner: 'Me',
            notes: `Created from note on ${new Date().toLocaleDateString('en-GB')}`,
          }),
        })
        // Mark note as consumed
        await fetch(`/api/notes/${note.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consumed: true }),
        })
        showToast(`✓ Created workstream "${note.content.slice(0,40)}" under ${cat?.name}`)
        fetchWorkstreams()

      } else if (ns.action === 'existing-workstream') {
        // Tag note to existing workstream
        const ws = workstreams.find(w => w.id === ns.existingWsId)
        const cat = CATS.find(c => c.id === ws?.cat_id)
        await fetch(`/api/notes/${note.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ws_id: ns.existingWsId, cat_id: ws?.cat_id || 'aob' }),
        })
        showToast(`✓ Added to workstream "${ws?.name}" — will appear in Weekly Agenda`)
      }

      // Clear the note state
      setNoteState(note.id, { action: 'none', newWsCategory: 'festivals', existingWsId: '', saving: false })
      fetchNotes()

    } catch (e) {
      setNoteState(note.id, { saving: false })
      showToast('Something went wrong — try again')
    }
  }

  async function deleteNote(id: string) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    fetchNotes()
  }

  const active = notes.filter(n => !n.consumed)
  const activeWs = workstreams.filter(w => w.status === 'active' || w.status === 'blocked')

  if (loading) return <AppNav><div className="flex items-center justify-center h-64 text-[#999]">Loading…</div></AppNav>

  return (
    <AppNav>
      {/* Add note */}
      <div className="card mb-4">
        <div className="text-xs font-mono uppercase tracking-widest text-[#999] mb-3">Add a note</div>
        <input
          className="w-full text-base bg-transparent border-none outline-none mb-3 placeholder-[#bbb]"
          placeholder="Capture anything — you can tag it to a workstream below…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addNote() }}
          autoFocus
        />
        <div className="h-px bg-[#F0F0F0] mb-3" />
        <div className="flex gap-2 items-center flex-wrap">
          <select className="select" value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="normal">Normal</option>
            <option value="high">! High priority</option>
            <option value="fyi">FYI only</option>
          </select>
          <div className="flex-1" />
          <button className="btn-primary font-bold" disabled={!input.trim() || adding} onClick={addNote}>
            {adding ? 'Adding…' : '+ Add note'}
          </button>
        </div>
      </div>

      {/* Notes count */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-[#999]">
          {active.length === 0 ? 'No notes yet — add something above' : `${active.length} note${active.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Empty state */}
      {active.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📝</div>
          <div className="font-bold text-lg mb-2">Nothing here yet</div>
          <div className="text-sm text-[#999] max-w-sm mx-auto">
            Add notes as things come up. Use the checkboxes to send them to a workstream when you're ready.
          </div>
        </div>
      )}

      {/* Notes list */}
      <div className="space-y-3">
        {active.map(note => {
          const ns = getNoteState(note.id)

          return (
            <div key={note.id} className="card"
              style={{borderLeft: ns.action !== 'none' ? '3px solid #F4631E' : '3px solid transparent'}}>

              {/* Note content — editable */}
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-1">
                  {ns.editing ? (
                    <div className="flex gap-2 items-start">
                      <textarea
                        className="textarea flex-1 text-sm"
                        rows={2}
                        autoFocus
                        value={ns.editContent}
                        onChange={e => setNoteState(note.id, { editContent: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Escape') setNoteState(note.id, { editing: false }) }}
                      />
                      <div className="flex flex-col gap-1">
                        <button className="btn-primary text-xs py-1 px-2" disabled={ns.saving}
                          onClick={() => saveEdit(note)}>
                          {ns.saving ? '…' : 'Save'}
                        </button>
                        <button className="btn-ghost text-xs"
                          onClick={() => setNoteState(note.id, { editing: false })}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <span className="text-sm leading-relaxed flex-1">{note.content}</span>
                      <button className="btn-ghost text-xs opacity-50 hover:opacity-100 shrink-0"
                        onClick={() => setNoteState(note.id, { editing: true, editContent: note.content })}>
                        ✏ Edit
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {note.priority === 'high' && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:'#FFF0E8',color:'#F4631E'}}>! High</span>}
                    {note.priority === 'fyi' && <span className="text-xs px-2 py-0.5 rounded-full bg-[#F0F0F0] text-[#666]">fyi</span>}
                    {note.workstreams && <span className="text-xs text-[#999]">↳ {note.workstreams.name}</span>}
                    <span className="text-xs text-[#bbb]">{new Date(note.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
                  </div>
                </div>
              </div>

              {/* Action checkboxes */}
              {!ns.editing && (
                <div className="border-t border-[#F5F5F5] pt-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[#999] mb-2">What do you want to do with this note?</div>
                  <div className="space-y-2 mb-3">

                    {/* Option 1: Create new workstream */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="radio"
                        name={`action-${note.id}`}
                        checked={ns.action === 'new-workstream'}
                        onChange={() => setNoteState(note.id, { action: ns.action === 'new-workstream' ? 'none' : 'new-workstream' })}
                        className="mt-0.5 cursor-pointer"
                        style={{accentColor:'#F4631E'}}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium">Create new workstream from this note</span>
                        {ns.action === 'new-workstream' && (
                          <div className="mt-2">
                            <div className="text-xs text-[#999] mb-1">Which category?</div>
                            <div className="flex flex-wrap gap-2">
                              {CATS.map(cat => (
                                <button key={cat.id}
                                  onClick={() => setNoteState(note.id, { newWsCategory: cat.id })}
                                  className="text-xs px-3 py-1.5 rounded-lg border-2 font-medium transition-all cursor-pointer"
                                  style={{
                                    background: ns.newWsCategory === cat.id ? cat.color : 'white',
                                    borderColor: ns.newWsCategory === cat.id ? cat.color : '#E5E5E5',
                                    color: ns.newWsCategory === cat.id ? 'white' : '#333'
                                  }}>
                                  {cat.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </label>

                    {/* Option 2: Add to existing workstream */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="radio"
                        name={`action-${note.id}`}
                        checked={ns.action === 'existing-workstream'}
                        onChange={() => setNoteState(note.id, { action: ns.action === 'existing-workstream' ? 'none' : 'existing-workstream' })}
                        className="mt-0.5 cursor-pointer"
                        style={{accentColor:'#F4631E'}}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium">Add to existing workstream</span>
                        {ns.action === 'existing-workstream' && (
                          <div className="mt-2">
                            {activeWs.length === 0 ? (
                              <div className="text-xs text-[#999]">No active workstreams yet — create one in the Workstreams tab first.</div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {CATS.map(cat => {
                                  const catWs = activeWs.filter(w => w.cat_id === cat.id)
                                  if (!catWs.length) return null
                                  return (
                                    <div key={cat.id}>
                                      <div className="text-[10px] font-mono uppercase tracking-widest mb-1 mt-1" style={{color:cat.color}}>{cat.name}</div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {catWs.map(ws => (
                                          <button key={ws.id}
                                            onClick={() => setNoteState(note.id, { existingWsId: ws.id })}
                                            className="text-xs px-3 py-1.5 rounded-lg border-2 font-medium transition-all cursor-pointer"
                                            style={{
                                              background: ns.existingWsId === ws.id ? '#111' : 'white',
                                              borderColor: ns.existingWsId === ws.id ? '#111' : '#E5E5E5',
                                              color: ns.existingWsId === ws.id ? 'white' : '#333'
                                            }}>
                                            {ws.name}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>

                  {/* Done / Delete buttons */}
                  <div className="flex items-center gap-2">
                    {ns.action !== 'none' && (
                      <button className="btn-primary font-bold"
                        disabled={ns.saving || (ns.action === 'existing-workstream' && !ns.existingWsId)}
                        onClick={() => handleDone(note)}>
                        {ns.saving ? 'Saving…' : 'Done →'}
                      </button>
                    )}
                    <div className="flex-1" />
                    <button className="btn-ghost text-xs opacity-40 hover:opacity-100"
                      style={{color:'#DC2626'}} onClick={() => deleteNote(note.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 px-4 py-3 rounded-lg text-sm font-medium shadow-lg z-50 max-w-sm"
          style={{background:'#111',color:'white'}}>
          {toast}
        </div>
      )}
    </AppNav>
  )
}
