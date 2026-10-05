// Plentry — `pay` Edge Function (Stripe, no SDK — plain fetch).
//
// task 'checkout' (signed-in user): creates a Stripe Checkout Session for the
//   user's order with MANUAL CAPTURE. Hold = (grocery estimate + 5% fee) * 1.30.
//   Door address comes from the app (orders.address.delivery). Stripe only
//   collects card billing; shipping collection is a fallback if delivery is missing.
//
// task 'capture' (admin only): pass the exact store total as amount_gbp; the
//   function adds the 5% Plentry fee and captures that, never above the hold.
//
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_test_...   (later sk_live_)
// Deploy:  supabase functions deploy pay

import { withSupabase } from 'npm:@supabase/server'
import { allow, clientIdent, TOO_MANY } from '../_shared/ratelimit.ts'
import { basketTotal, clean, cleanMeals, cleanRecipes, rebuildBasket } from '../_shared/orders.ts'

const ADMIN_EMAIL = 'noyouchka.bouchard@gmail.com'
const COMMISSION = 0.05
const HOLD_MULTIPLIER = 1.30
const APP_URL = 'https://getplentry.com'
const MAX_ORDER_GBP = 500

// Store name (as stored on orders) -> ingredient_prices store id + delivery fee.
const STORE_DB: Record<string, { db: string; fee: number }> = {
  'Asda': { db: 'asda', fee: 3.00 },
  "Sainsbury's": { db: 'sainsburys', fee: 3.50 },
  'Waitrose': { db: 'waitrose', fee: 4.00 },
  'Tesco': { db: 'tesco', fee: 3.00 },
}

// NEVER trust the client-written orders.total for money. Recompute the estimate
// from the server-side shelf-price table (same data the client priced from), so
// a tampered order row can't buy £60 of groceries on a £0.01 hold.
//
// S-04: the basket itself is rebuilt here too. Only catalog keys survive, and
// product / pack / price / search come from ingredient_prices + the store
// whitelist. The rebuilt items are written back to the row so Ops and Telegram
// never see client-written product names or links.
async function serverTotal(admin: any, store: string, items: any): Promise<{ total: number; items: any } | { error: string }> {
  const s = STORE_DB[store]
  if (!s) return { error: 'unknown store' }
  const { data, error } = await admin
    .from('ingredient_prices')
    .select('meal_key,display_name,product_name,pack_size,price_gbp')
    .eq('store', s.db)
  if (error) return { error: 'prices unavailable' }
  const rebuilt = rebuildBasket(items?.basket, data || [], store)
  if ('error' in rebuilt) return rebuilt
  const t = Math.round((basketTotal(rebuilt.basket) + s.fee) * 100) / 100
  if (!(t > 0 && t <= MAX_ORDER_GBP)) return { error: 'total out of range' }
  // Snapshot cooking methods from the catalog (then any client copy) so the
  // customer can read them from the order after the week moves on (I-O15).
  const names = cleanMeals(items?.meals)
  let catalogRows: unknown[] = []
  if (names.length) {
    const { data } = await admin.from('meals').select('name,emoji,time,ing,recipe').in('name', names)
    if (Array.isArray(data)) catalogRows = data
  }
  const clientRecipes = Array.isArray(items?.recipes) ? items.recipes : []
  return {
    total: t,
    items: {
      basket: rebuilt.basket,
      meals: names,
      recipes: cleanRecipes([...catalogRows, ...clientRecipes], names),
      eta: clean(items?.eta, 40) || null,
      mode: 'manual',
    },
  }
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
        .from('orders').select('id,total,store,items,payment_status,address,checkout_session').eq('id', orderId).single()
      if (!o) return Response.json({ error: 'order not found' }, { status: 404 })
      if (o.payment_status === 'authorized' || o.payment_status === 'captured')
        return Response.json({ error: 'already paid' }, { status: 400 })

      // Authoritative server-side estimate; the stored total is display-only.
      const priced = await serverTotal(ctx.supabaseAdmin, o.store, o.items)
      if ('error' in priced) return Response.json({ error: 'order not priceable', detail: priced.error }, { status: 400 })
      const est = priced.total
      // Keep the row honest: server total + server-built basket (S-04). The
      // validate_order trigger re-checks total/items on this UPDATE.
      {
        const { error } = await ctx.supabaseAdmin.from('orders').update({ total: est, items: priced.items }).eq('id', o.id)
        if (error) return Response.json({ error: 'order not priceable', detail: 'could not store server estimate' }, { status: 400 })
      }

      // S-09: one open Checkout Session per order. Expire the previous one so a
      // customer can never complete two sessions and carry two holds.
      if (o.checkout_session) {
        await stripe(sk, `checkout/sessions/${encodeURIComponent(String(o.checkout_session))}/expire`, new URLSearchParams())
          .catch(() => null) // already complete/expired is fine
      }

      const charged = est * (1 + COMMISSION)
      const amount = Math.round(charged * HOLD_MULTIPLIER * 100) // pence: groceries+fee, plus ~30% buffer
      const p = new URLSearchParams()
      p.set('mode', 'payment')
      p.set('success_url', `${APP_URL}/?paid=1&order=${o.id}`)
      p.set('cancel_url', `${APP_URL}/?paycancel=1&order=${o.id}`)
      p.set('payment_intent_data[capture_method]', 'manual')
      // Cards only: no delayed-notification methods, so `completed` == authorised.
      p.set('payment_method_types[0]', 'card')
      p.set('payment_intent_data[metadata][order_id]', String(o.id))
      p.set('metadata[order_id]', String(o.id))
      p.set('billing_address_collection', 'auto')
      p.set('phone_number_collection[enabled]', 'true')
      p.set('line_items[0][quantity]', '1')
      p.set('line_items[0][price_data][currency]', 'gbp')
      p.set('line_items[0][price_data][unit_amount]', String(amount))
      p.set('line_items[0][price_data][product_data][name]', `Plentry groceries — ${o.store}`)
      p.set('line_items[0][price_data][product_data][description]',
        'Hold covers the estimate + 5% Plentry fee, with ~15% buffer. You are charged the exact store total plus 5%.')
      if (ctx.userClaims?.email) p.set('customer_email', ctx.userClaims.email)
      const del = o.address && o.address.delivery
      if (del && del.line1 && del.city && del.postcode) {
        p.set('payment_intent_data[shipping][name]', String(del.name || ''))
        if (del.phone) p.set('payment_intent_data[shipping][phone]', String(del.phone))
        p.set('payment_intent_data[shipping][address][line1]', String(del.line1))
        if (del.line2) p.set('payment_intent_data[shipping][address][line2]', String(del.line2))
        p.set('payment_intent_data[shipping][address][city]', String(del.city))
        p.set('payment_intent_data[shipping][address][postal_code]', String(del.postcode))
        p.set('payment_intent_data[shipping][address][country]', 'GB')
      } else {
        p.set('shipping_address_collection[allowed_countries][0]', 'GB')
      }

      const { ok, j } = await stripe(sk, 'checkout/sessions', p)
      if (!ok) return Response.json({ error: 'stripe', detail: j.error?.message }, { status: 502 })

      {
        const { error } = await ctx.supabaseAdmin.from('orders')
          .update({
            payment_status: 'unpaid',
            payment_intent: j.payment_intent || null,
            checkout_session: j.id ? String(j.id).slice(0, 120) : null,
            amount_held: amount / 100,
          })
          .eq('id', o.id)
        if (error) return Response.json({ error: 'stripe', detail: 'session created but not recorded — retry' }, { status: 500 })
      }
      return Response.json({ live: true, url: j.url, held_gbp: amount / 100 })
    }

    if (task === 'capture') {
      // Server-side admin check — the email in the verified JWT, never the payload.
      if (ctx.userClaims?.email !== ADMIN_EMAIL) return Response.json({ error: 'forbidden' }, { status: 403 })
      // S-06: once the founder has enrolled TOTP, flip REQUIRE_ADMIN_MFA=1 so a
      // password-only (aal1) session can never move money.
      // aal is on the raw JWT. @supabase/server's userClaims is only
      // {id,role,email,appMetadata,userMetadata} — userClaims.aal is always
      // undefined and would 403 every capture, even after a TOTP login.
      if (Deno.env.get('REQUIRE_ADMIN_MFA') === '1' && ctx.jwtClaims?.aal !== 'aal2')
        return Response.json({ error: 'mfa_required', detail: 'Enter your 2-step verification code, then try again.' }, { status: 403 })
      if (!sk) return Response.json({ live: false })
      const { order_id, amount_gbp } = payload || {}
      const { data: o } = await ctx.supabaseAdmin.from('orders')
        .select('id,payment_intent,amount_held,payment_status').eq('id', order_id).single()
      if (!o?.payment_intent) return Response.json({ error: 'no payment intent on order' }, { status: 400 })
      if (o.payment_status !== 'authorized') return Response.json({ error: `status is ${o.payment_status}` }, { status: 400 })
      // S-02: a hold we did not record is not a hold. Never fall through to
      // Stripe with an unknown ceiling.
      const heldPence = Math.round(Number(o.amount_held) * 100)
      if (!Number.isFinite(heldPence) || heldPence <= 0) return Response.json({ error: 'no hold recorded on order' }, { status: 400 })
      const storePence = Math.round(Number(amount_gbp) * 100)
      if (!storePence || storePence <= 0) return Response.json({ error: 'bad amount' }, { status: 400 })
      let amt = Math.round(storePence * (1 + COMMISSION))
      // Never capture more than the authorised hold (I-M04). If the till + 5%
      // is above it, take the whole hold — Plentry eats the rest from the float.
      if (amt > heldPence) amt = heldPence

      const { ok, j } = await stripe(sk, `payment_intents/${o.payment_intent}/capture`,
        new URLSearchParams({ amount_to_capture: String(amt) }))
      if (!ok) return Response.json({ error: 'stripe', detail: j.error?.message }, { status: 502 })

      await ctx.supabaseAdmin.from('orders')
        .update({ payment_status: 'captured', amount_captured: amt / 100 })
        .eq('id', order_id)
      return Response.json({ live: true, captured_gbp: amt / 100, store_gbp: storePence / 100, fee_gbp: (amt - storePence) / 100 })
    }

    return Response.json({ error: 'unknown task' }, { status: 400 })
  }),
}
