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
    const orderId = s?.metadata?.order_id
    if (!orderId) return Response.json({ received: true })

    if (evt.type === 'checkout.session.completed') {
      // shipping details moved between Stripe API versions — accept either shape
      const shipping = s.shipping_details || s.collected_information?.shipping_details || null
      await ctx.supabaseAdmin.from('orders').update({
        payment_status: 'authorized',
        payment_intent: s.payment_intent || null,
        address: {
          shipping,
          email: s.customer_details?.email || null,
          name: s.customer_details?.name || null,
          phone: s.customer_details?.phone || null,
        },
      }).eq('id', orderId)
    }

    if (evt.type === 'checkout.session.expired') {
      await ctx.supabaseAdmin.from('orders')
        .update({ payment_status: 'canceled' })
        .eq('id', orderId).eq('payment_status', 'unpaid')
    }

    return Response.json({ received: true })
  }),
}
