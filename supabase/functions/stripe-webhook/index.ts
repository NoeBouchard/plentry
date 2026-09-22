// Plentry — `stripe-webhook` Edge Function.
//
// Register in Stripe Dashboard -> Developers -> Webhooks:
//   endpoint: https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/stripe-webhook
//   events:   checkout.session.completed, checkout.session.expired
// then: supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//
// On checkout.session.completed: saves the delivery address + customer details
// to the order and flips payment_status to 'authorized' — which fires the
// notify_order_paid_webhook DB trigger, i.e. the Telegram ping happens ONLY
// once the money is held. Signature verified with WebCrypto (no SDK).

import { withSupabase } from 'npm:@supabase/server'
import { ukPostcode } from '../_shared/orders.ts'

async function verifySignature(payload: string, header: string, secret: string): Promise<boolean> {
  try {
    const parts: Record<string, string> = {}
    for (const kv of header.split(',')) { const [k, v] = kv.split('='); if (k && v) parts[k.trim()] = v.trim() }
    if (!parts.t || !parts.v1) return false
    // reject stale events (>10 min) to prevent replay
    if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${payload}`))
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return timingSafeEqual(hex, parts.v1)
  } catch { return false }
}

// Constant-time string compare — a plain === leaks how many leading chars
// matched via response timing, which lets signatures be brute-forced byte-wise.
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let d = 0
  for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i]
  return d === 0
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'method not allowed' }, { status: 405 })
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const payload = await req.text()
    const sig = req.headers.get('stripe-signature') || ''
    if (!secret || !(await verifySignature(payload, sig, secret)))
      return Response.json({ error: 'bad signature' }, { status: 401 })

    const evt = JSON.parse(payload)
    const s = evt.data?.object
    const orderId = Number(s?.metadata?.order_id)
    if (!Number.isInteger(orderId) || orderId <= 0) return Response.json({ received: true })
    const sessionId = typeof s?.id === 'string' && /^cs_[A-Za-z0-9_]+$/.test(s.id) ? s.id.slice(0, 120) : null

    // S-05: a DB error must surface as 5xx so Stripe retries. Before this, a
    // failed update returned 200 and a held payment could sit at `unpaid`.
    const dbFail = (what: string, err: unknown) => {
      console.error('stripe-webhook', evt.id, what, String((err as any)?.message || err).slice(0, 300))
      return Response.json({ error: 'db', what }, { status: 500 })
    }

    if (evt.type === 'checkout.session.completed') {
      const stripeShip = s.shipping_details || s.collected_information?.shipping_details || null
      const { data: row, error: readErr } = await ctx.supabaseAdmin.from('orders')
        .select('address,postcode,payment_status').eq('id', orderId).maybeSingle()
      if (readErr) return dbFail('read', readErr)
      if (!row) { console.error('stripe-webhook', evt.id, 'unknown order', orderId); return Response.json({ received: true }) }
      const prev = row.address && typeof row.address === 'object' && !Array.isArray(row.address) ? row.address : {}
      const sa = stripeShip && stripeShip.address
      const fromStripe = sa
        ? {
            name: stripeShip.name || '',
            phone: stripeShip.phone || '',
            line1: sa.line1 || '',
            line2: sa.line2 || '',
            city: sa.city || '',
            postcode: sa.postal_code || '',
          }
        : null
      const delivery = prev.delivery && prev.delivery.line1 ? prev.delivery : fromStripe
      // S-05: only write a UK-shaped postcode; otherwise keep what the row has
      // (the validate_order trigger would reject the update and lose the event).
      const postcode = ukPostcode(delivery && delivery.postcode) || row.postcode
      // S-09: record the hold Stripe actually authorised (pence -> £) and the
      // session that produced it, so capture caps against the real ceiling.
      const heldGbp = Number.isFinite(Number(s.amount_total)) && Number(s.amount_total) > 0
        ? Math.round(Number(s.amount_total)) / 100
        : null
      const update: Record<string, unknown> = {
        payment_status: 'authorized',
        payment_intent: s.payment_intent || null,
        checkout_session: sessionId,
        postcode,
        address: {
          ...prev,
          delivery,
          shipping: stripeShip,
          email: s.customer_details?.email || prev.email || null,
          name: (delivery && delivery.name) || s.customer_details?.name || prev.name || null,
          phone: (delivery && delivery.phone) || s.customer_details?.phone || prev.phone || null,
        },
      }
      if (heldGbp) update.amount_held = heldGbp
      // S-05: never regress a captured (or already authorised) order. A late or
      // duplicate `completed` event is acknowledged and ignored.
      const { data: updated, error } = await ctx.supabaseAdmin.from('orders')
        .update(update)
        .eq('id', orderId)
        .in('payment_status', ['unpaid', 'none', 'canceled'])
        .select('id')
      if (error) return dbFail('authorize', error)
      if (!updated || !updated.length) console.log('stripe-webhook', evt.id, 'order', orderId, 'already', row.payment_status, '- ignored')
    }

    if (evt.type === 'checkout.session.expired') {
      // S-09: only the CURRENT session may cancel the order (pay expires the
      // previous one on purpose when it opens a fresh session). Rows from before
      // checkout_session existed (null) still cancel as before.
      let q = ctx.supabaseAdmin.from('orders')
        .update({ payment_status: 'canceled' })
        .eq('id', orderId).eq('payment_status', 'unpaid')
      q = sessionId ? q.or(`checkout_session.eq.${sessionId},checkout_session.is.null`) : q.is('checkout_session', null)
      const { error } = await q
      if (error) return dbFail('cancel', error)
    }

    return Response.json({ received: true })
  }),
}
