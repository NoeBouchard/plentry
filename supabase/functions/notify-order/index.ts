// Plentry — `notify-order` Edge Function.
//
// Called by a Supabase DATABASE WEBHOOK on INSERT into public.orders
// (Dashboard -> Database -> Webhooks -> Create: table=orders, events=INSERT,
//  type=Supabase Edge Function, function=notify-order,
//  HTTP header:  x-webhook-secret: <same value as ORDER_WEBHOOK_SECRET>).
//
// Sends an instant Telegram message to Noe with the full order + shopping list
// so manual (concierge) fulfilment can start within minutes.
//
// Secrets:
//   supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC...   (from @BotFather)
//   supabase secrets set TELEGRAM_CHAT_ID=123456789         (your chat id)
//   supabase secrets set ORDER_WEBHOOK_SECRET=<long random string>
// Deploy:
//   supabase functions deploy notify-order
//
// auth: 'none' — the DB webhook has no user JWT; the shared secret header is
// the gate instead (verify_jwt=false in config.toml).

import { withSupabase } from 'npm:@supabase/server'
import { clean, searchUrl } from '../_shared/orders.ts'

const TELEGRAM_MAX = 4000 // sendMessage rejects > 4096 chars; a lost ping is worse than a trimmed one

function mustBook(r: any): string {
  const date = String(r?.slot_date || '')
  const start = String(r?.slot_start || '').slice(0, 5)
  const end = String(r?.slot_end || '').slice(0, 5)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !start || !end) return ''
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return `${day} ${start}–${end}`
}

// S-04: every link in the founder's Telegram is rebuilt from the store whitelist.
// The row's own `search` field is ignored even though `pay` now writes it server-side.
export function fmtOrder(r: any): string {
  const items = Array.isArray(r.items && r.items.basket) ? r.items.basket.slice(0, 60) : []
  const meals = Array.isArray(r.items && r.items.meals) ? r.items.meals.slice(0, 7).map((m: any) => clean(m, 60)) : []
  const lines = items.flatMap((b: any) => {
    const q = Math.max(1, Math.round(Number(b.q) || 1))
    const label = clean(b.product || b.i, 80)
    const pack = clean(b.pack || b.unit, 40)
    const price = Number(b.shelf_price)
    const title = `• ${q}× ${label}${pack ? ` (${pack})` : ''}${
      Number.isFinite(price) && price > 0 ? ` — £${(q * price).toFixed(2)}` : ''
    }`
    const link = searchUrl(r.store, label)
    return link ? [title, `  ${link}`] : [title]
  })
  const paid = r.payment_status === 'authorized'
  const d = r.address?.delivery
  const ship = r.address?.shipping?.address
  const addr = d && d.line1
    ? [d.name, d.line1, d.line2, d.city, d.postcode].filter(Boolean).join(', ')
    : ship
    ? [ship.line1, ship.line2, ship.city, ship.postal_code].filter(Boolean).join(', ')
    : r.postcode || '—'
  const phone = d?.phone || r.address?.phone || r.address?.shipping?.phone || ''
  const window = mustBook(r)
  return [
    paid
      ? `💳 PAID ORDER #${r.id} — hold £${Number(r.amount_held || 0).toFixed(2)}, capture exact total after ordering`
      : `🛒 NEW PLENTRY ORDER #${r.id} (concierge — do not shop until paid)`,
    ``,
    phone ? `PHONE: ${phone}` : 'PHONE: missing — ask the customer before shopping',
    window ? `MUST book: ${window}` : '',
    `${r.address?.name || r.name || '—'} · ${r.address?.email || r.email || '—'}`,
    `Deliver to: ${addr}`,
    `Store: ${r.store || '—'} · Est. total: £${Number(r.total || 0).toFixed(2)}`,
    meals.length ? `Meals: ${meals.join(', ')}` : '',
    ``,
    ...lines,
    ``,
    paid
      ? `Shop this list at the store only if that window exists, then capture the exact amount in the Ops tab.`
      : `Waiting for card hold — do not place this yet.`,
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
    .slice(0, TELEGRAM_MAX)
}

export function fmtIssue(r: any): string {
  const body = clean(r?.body, 1000)
  return [
    `📨 ISSUE on order #${r?.order_id}`,
    body || '(empty)',
    `Reply in Plentry Inbox — do not shop a different slot.`,
  ]
    .join('\n')
    .slice(0, TELEGRAM_MAX)
}

// Constant-time compare so response timing can't leak the secret byte-by-byte.
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let d = 0
  for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i]
  return d === 0
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req: Request) => {
    if (req.method !== 'POST') return Response.json({ error: 'method not allowed' }, { status: 405 })

    const secret = Deno.env.get('ORDER_WEBHOOK_SECRET')
    if (!secret || !timingSafeEqual(req.headers.get('x-webhook-secret') || '', secret))
      return Response.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => null)
    // DB trigger payload: { type:'INSERT'|'UPDATE', table:'orders'|'order_messages', record:{...} }
    // orders INSERT = unpaid row; orders UPDATE = payment_status flipped to 'authorized'.
    // order_messages INSERT = customer issue ping (ops replies stay in-app).
    const rec = body?.record
    if (!['INSERT', 'UPDATE'].includes(body?.type) || !rec)
      return Response.json({ error: 'unexpected payload' }, { status: 400 })
    let text = ''
    if (body?.table === 'orders') text = fmtOrder(rec)
    else if (body?.table === 'order_messages') {
      if (rec.author_role !== 'customer') return Response.json({ ok: true, skipped: true })
      text = fmtIssue(rec)
    } else {
      return Response.json({ error: 'unexpected payload' }, { status: 400 })
    }

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
    if (!token || !chatId) return Response.json({ error: 'telegram not configured' }, { status: 500 })

    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
    if (!r.ok) {
      const t = await r.text()
      return Response.json({ error: 'telegram', detail: t.slice(0, 200) }, { status: 502 })
    }
    return Response.json({ ok: true })
  }),
}
