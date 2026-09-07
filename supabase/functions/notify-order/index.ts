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

function fmtOrder(r: any): string {
  const items = (r.items && r.items.basket) || []
  const meals = (r.items && r.items.meals) || []
  const lines = items.flatMap((b: any) => {
    const title = `• ${b.q}× ${b.product || b.i}${b.pack ? ` (${b.pack})` : b.unit ? ` (${b.unit})` : ''}${
      b.shelf_price ? ` — £${(b.q * b.shelf_price).toFixed(2)}` : ''
    }`
    return b.search ? [title, `  ${b.search}`] : [title]
  })
  const paid = r.payment_status === 'authorized'
  const ship = r.address?.shipping?.address
  const addr = ship
    ? [ship.line1, ship.line2, ship.city, ship.postal_code].filter(Boolean).join(', ')
    : r.postcode || '—'
  const phone = r.address?.phone || r.address?.shipping?.phone || ''
  return [
    paid
      ? `💳 PAID ORDER #${r.id} — hold £${Number(r.amount_held || 0).toFixed(2)}, capture exact total after ordering`
      : `🛒 NEW PLENTRY ORDER #${r.id} (concierge — do not shop until paid)`,
    ``,
    `${r.address?.name || r.name || '—'} · ${r.address?.email || r.email || '—'}`,
    phone ? `Phone: ${phone}` : '',
    `Deliver to: ${addr}`,
    `Store: ${r.store || '—'} · Est. total: £${Number(r.total || 0).toFixed(2)}`,
    meals.length ? `Meals: ${meals.join(', ')}` : '',
    ``,
    ...lines,
    ``,
    paid
      ? `Shop this list at the store, then capture the exact amount in the Ops tab.`
      : `Waiting for card hold — do not place this yet.`,
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
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
    // DB trigger payload: { type:'INSERT'|'UPDATE', table:'orders', record:{...} }
    // INSERT = free-beta order; UPDATE = payment_status flipped to 'authorized'.
    const rec = body?.record
    if (!['INSERT', 'UPDATE'].includes(body?.type) || body?.table !== 'orders' || !rec)
      return Response.json({ error: 'unexpected payload' }, { status: 400 })

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
    if (!token || !chatId) return Response.json({ error: 'telegram not configured' }, { status: 500 })

    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: fmtOrder(rec), disable_web_page_preview: true }),
    })
    if (!r.ok) {
      const t = await r.text()
      return Response.json({ error: 'telegram', detail: t.slice(0, 200) }, { status: 502 })
    }
    return Response.json({ ok: true })
  }),
}
