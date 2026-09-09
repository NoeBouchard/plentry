// Plentry — `newcoming` Edge Function.
//
// Fortnight reminder of unreviewed AI/advisor dinners (reviewed_at is null).
// Called by pg_cron (`invoke_newcoming_review`) on the 1st and 15th at 09:00 UTC.
//
// Secrets (same as notify-order):
//   ORDER_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Deploy:
//   supabase functions deploy newcoming
//
// auth: 'none' — cron has no user JWT; the shared secret header is the gate
// (verify_jwt=false in config.toml). Does not auto-approve meals.

import { withSupabase } from 'npm:@supabase/server'

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let d = 0
  for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i]
  return d === 0
}

function fmtQueue(rows: any[]): string {
  const lines = rows.slice(0, 30).map((m) => {
    const tags = Array.isArray(m.tags) ? m.tags.join(', ') : ''
    const ings = Array.isArray(m.ing) ? m.ing.join(', ') : ''
    const day = String(m.created_at || '').slice(0, 10)
    return `• ${m.emoji || ''} ${m.name} (${m.source || '?'}, ${m.time || '?'} min, ${day})\n  tags: ${tags}\n  ${ings}`
  })
  const extra = rows.length > 30 ? `\n…and ${rows.length - 30} more` : ''
  return [
    `🍽️ ${rows.length} newcoming meal${rows.length === 1 ? '' : 's'} waiting for review`,
    ``,
    `Open Ops on plentry.vercel.app and mark each one reviewed (or delete odd recipes in the Table Editor).`,
    ``,
    ...lines,
    extra,
  ].join('\n')
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'method not allowed' }, { status: 405 })

    const secret = Deno.env.get('ORDER_WEBHOOK_SECRET')
    if (!secret || !timingSafeEqual(req.headers.get('x-webhook-secret') || '', secret))
      return Response.json({ error: 'unauthorized' }, { status: 401 })

    const { data, error } = await ctx.supabaseAdmin
      .from('meals')
      .select('id,name,emoji,time,ing,tags,source,created_at,reviewed_at')
      .is('reviewed_at', null)
      .order('created_at', { ascending: false })
      .limit(80)

    if (error) return Response.json({ error: 'db', detail: String(error.message || error).slice(0, 200) }, { status: 500 })

    const rows = Array.isArray(data) ? data : []
    if (!rows.length) return Response.json({ ok: true, count: 0 })

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
    if (!token || !chatId) return Response.json({ error: 'telegram not configured' }, { status: 500 })

    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: fmtQueue(rows), disable_web_page_preview: true }),
    })
    if (!r.ok) {
      const t = await r.text()
      return Response.json({ error: 'telegram', detail: t.slice(0, 200) }, { status: 502 })
    }
    return Response.json({ ok: true, count: rows.length })
  }),
}
