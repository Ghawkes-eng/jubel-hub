import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID || '1WVmXCL9mf7zLCT-gRtBCyUu9A7xLlPikkJ5lYYsbuXc'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions) as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workstreams } = await req.json()
  const accessToken = session.gAccessToken
  if (!accessToken) return NextResponse.json({ error: 'No Google access token' }, { status: 401 })

  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const sheets = google.sheets({ version:'v4', auth })

  const weekLabel = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
  const tabName = `Workstreams ${weekLabel}`

  // Build rows
  const rows: string[][] = [
    [`Workstreams — ${weekLabel}`],
    [''],
    ['WORKSTREAM', 'CATEGORY', 'STATUS', 'OWNER', 'DEADLINE', 'BRIEFING', 'ADDITIONAL CONTEXT'],
  ]

  const CATS: Record<string,string> = {
    festivals:'Festivals & Events', sports:'Sports & Lifestyle',
    music:'Music & Culture', brand:'Brand Events', aob:'AOB'
  }

  workstreams.forEach((ws: any) => {
    rows.push([
      ws.name || '',
      CATS[ws.cat_id] || ws.cat_id || '',
      ws.status || '',
      ws.owner || '',
      ws.deadline ? new Date(ws.deadline).toLocaleDateString('en-GB') : '',
      (ws.briefing || '').replace(/\n/g,' '),
      (ws.additional_context || '').replace(/\n/g,' '),
    ])
  })

  try {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
      })
    } catch (e) { /* tab exists, overwrite */ }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    })

    return NextResponse.json({ ok: true, tabName })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
