// Plentry — `pay` Edge Function (Stripe, no SDK — plain fetch).
//
// task 'checkout' (signed-in user): creates a Stripe Checkout Session for the
//   user's order with MANUAL CAPTURE — the card is held for estimate +15%, the
//   exact store total is captured later. Stripe's hosted page also collects the
//   GB delivery address, so payment + address arrive together before any
//   fulfilment happens. Returns {live:true,url} to redirect the user to, or
//   {live:false} when STRIPE_SECRET_KEY isn't configured (free-beta fallback).
//
// task 'capture' (admin only): captures the exact amount after the store order
//   is placed. amount_gbp must be <= the held amount.
//
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_test_...   (later sk_live_)
// Deploy:  supabase functions deploy pay

import { withSupabase } from 'npm:@supabase/server'
import { allow, clientIdent, TOO_MANY } from '../_shared/ratelimit.ts'

const ADMIN_EMAIL = 'noyouchka.bouchard@gmail.com'
const HOLD_MULTIPLIER = 1.15
const APP_URL = 'https://plentry.vercel.app'
const MAX_ORDER_GBP = 500

// Store name (as stored on orders) -> ingredient_prices store id + delivery fee.
const STORE_DB: Record<string, { db: string; fee: number }> = {
  'Asda': { db: 'asda', fee: 3.00 },
  "Sainsbury's": { db: 'sainsburys', fee: 3.50 },
  'Waitrose': { db: 'waitrose', fee: 4.00 },
  'Tesco': { db: 'tesco', fee: 3.00 },
}
const FALLBACK_ITEM_GBP = 2.50 // same fallback the client uses for unknown items

// NEVER trust the client-written orders.total for money. Recompute the estimate
// from the server-side shelf-price table (same data the client priced from), so
// a tampered order row can't buy £60 of groceries on a £0.01 hold.
async function serverTotal(admin: any, store: string, items: any): Promise<number | null> {
  const s = STORE_DB[store]
  if (!s) return null
  const basket = items?.basket
  if (!Array.isArray(basket) || !basket.length || basket.length > 60) return null
  const { data } = await admin
    .from('ingredient_prices')
    .select('meal_key,display_name,price_gbp')
    .eq('store', s.db)
  const price: Record<string, number> = {}
  for (const r of data || []) {
    if (r.meal_key) price[r.meal_key] = Number(r.price_gbp)
    else if (r.display_name) price[String(r.display_name).toLowerCase()] = Number(r.price_gbp)
  }
  let t = 0
  for (const b of basket) {
    const q = Math.min(50, Math.max(1, Math.round(Number(b?.q) || 1)))
    t += q * (price[b?.i] ?? FALLBACK_ITEM_GBP)
  }
  t += s.fee
  return t > 0 && t <= MAX_ORDER_GBP ? t : null
}

async function stripe(sk: string, path: string, params: URLSearchParams) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sk}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  const j = await r.json()
  return { ok: r.ok, j }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { task, payload } = await req.json().catch(() => ({}))
    const sk = Deno.env.get('STRIPE_SECRET_KEY')

    // Signed-in only (verify_jwt=true), but still cap to stop a compromised or
    // scripted session from hammering Stripe session/capture creation.
    if (!(await allow(ctx.supabaseAdmin, 'pay', clientIdent(req, ctx), 15, 60))) return TOO_MANY()

    if (task === 'checkout') {
      const orderId = payload?.order_id
      if (!sk) {
        // Concierge launch: never downgrade to free-beta. An unpaid row with
        // no Stripe session must not ping Telegram or look placeable.
        return Response.json({ live: false, error: 'payments_not_ready' })
      }
      // RLS-scoped read: users can only fetch their own order.
      const { data: o } = await ctx.supabase
        .from('orders').select('id,total,store,items,payment_status').eq('id', orderId).single()
      if (!o) return Response.json({ error: 'order not found' }, { status: 404 })
      if (o.payment_status === 'authorized' || o.payment_status === 'captured')
        return Response.json({ error: 'already paid' }, { status: 400 })

      // Authoritative server-side estimate; the stored total is display-only.
      const est = await serverTotal(ctx.supabaseAdmin, o.store, o.items)
      if (est === null) return Response.json({ error: 'order not priceable' }, { status: 400 })
      // Keep the row honest if the client-side figure drifted or was tampered with.
      if (Math.abs(Number(o.total) - est) > 0.01)
        await ctx.supabaseAdmin.from('orders').update({ total: est }).eq('id', o.id)

      const amount = Math.round(est * HOLD_MULTIPLIER * 100) // pence
      const p = new URLSearchParams()
      p.set('mode', 'payment')
      p.set('success_url', `${APP_URL}/?paid=1&order=${o.id}`)
      p.set('cancel_url', `${APP_URL}/?paycancel=1&order=${o.id}`)
      p.set('payment_intent_data[capture_method]', 'manual')
      p.set('payment_intent_data[metadata][order_id]', String(o.id))
      p.set('metadata[order_id]', String(o.id))
      p.set('shipping_address_collection[allowed_countries][0]', 'GB')
      p.set('phone_number_collection[enabled]', 'true')
      p.set('line_items[0][quantity]', '1')
      p.set('line_items[0][price_data][currency]', 'gbp')
      p.set('line_items[0][price_data][unit_amount]', String(amount))
      p.set('line_items[0][price_data][product_data][name]', `Plentry groceries — ${o.store}`)
      p.set('line_items[0][price_data][product_data][description]',
        'Temporary hold ≈15% above the estimate. You are only charged the exact store total.')
      if (ctx.userClaims?.email) p.set('customer_email', ctx.userClaims.email)

      const { ok, j } = await stripe(sk, 'checkout/sessions', p)
      if (!ok) return Response.json({ error: 'stripe', detail: j.error?.message }, { status: 502 })

      await ctx.supabaseAdmin.from('orders')
        .update({ payment_status: 'unpaid', payment_intent: j.payment_intent || null, amount_held: amount / 100 })
        .eq('id', o.id)
      return Response.json({ live: true, url: j.url, held_gbp: amount / 100 })
    }

    if (task === 'capture') {
      if (ctx.userClaims?.email !== ADMIN_EMAIL) return Response.json({ error: 'forbidden' }, { status: 403 })
      if (!sk) return Response.json({ live: false })
      const { order_id, amount_gbp } = payload || {}
      const { data: o } = await ctx.supabaseAdmin.from('orders')
        .select('id,payment_intent,amount_held,payment_status').eq('id', order_id).single()
      if (!o?.payment_intent) return Response.json({ error: 'no payment intent on order' }, { status: 400 })
      if (o.payment_status !== 'authorized') return Response.json({ error: `status is ${o.payment_status}` }, { status: 400 })
      const amt = Math.round(Number(amount_gbp) * 100)
      if (!amt || amt <= 0) return Response.json({ error: 'bad amount' }, { status: 400 })
      // Server-side too (the UI checks this, but the UI is not a boundary):
      // can never capture more than the authorized hold.
      if (o.amount_held && amt > Math.round(Number(o.amount_held) * 100))
        return Response.json({ error: 'amount exceeds hold' }, { status: 400 })

      const { ok, j } = await stripe(sk, `payment_intents/${o.payment_intent}/capture`,
        new URLSearchParams({ amount_to_capture: String(amt) }))
      if (!ok) return Response.json({ error: 'stripe', detail: j.error?.message }, { status: 502 })

      await ctx.supabaseAdmin.from('orders')
        .update({ payment_status: 'captured', amount_captured: amt / 100 })
        .eq('id', order_id)
      return Response.json({ live: true, captured_gbp: amt / 100 })
    }

    return Response.json({ error: 'unknown task' }, { status: 400 })
  }),
}
