import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID || '1WVmXCL9mf7zLCT-gRtBCyUu9A7xLlPikkJ5lYYsbuXc'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions) as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date, summary, workstreams, actions } = await req.json()
  const accessToken = session.accessToken

  if (!accessToken) return NextResponse.json({ error: 'No Google access token' }, { status: 401 })

  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const sheets = google.sheets({ version: 'v4', auth })

  // Build rows to write
  const rows: string[][] = [
    [`Weekly Catch-up — ${date}`],
    [''],
    ['Summary', summary || '(no summary)'],
    [''],
    ['WORKSTREAM', 'NOTES'],
    ...workstreams.map((w: any) => [w.name, w.notes || '']),
    [''],
    ['ACTIONS', 'OWNER', 'STATUS'],
    ...actions.map((a: any) => [a.content, a.owner, a.done ? 'Done ✓' : 'Open']),
  ]

  // Tab name based on date (safe for sheet tab names)
  const tabName = `Catchup ${date.replace(/[^\w\s-]/g, '').trim().slice(0,25)}`

  try {
    // Try to add a new sheet tab
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }]
        }
      })
    } catch (e) {
      // Tab might already exist — that's fine, we'll overwrite it
    }

    // Write data to the tab
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    })

    return NextResponse.json({ ok: true, tabName })
  } catch (e: any) {
    console.error('Sheet sync error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
