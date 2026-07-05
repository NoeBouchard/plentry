// Plentry checkout endpoint — real basket creation via Pepesto (pepesto.com).
//
// Why Pepesto (decided 5 Jul 2026): the only self-serve API doing real product
// matching + basket creation at Tesco / Sainsbury's / Asda / Waitrose (+ Morrisons).
// ~€0.04 per store quote, €0.60 per bag. The user pays the SUPERMARKET directly —
// Pepesto's white-label flow logs them into their own store account and fills the
// basket; payment is never automated. This function is the only place that talks
// to Pepesto, so the vendor stays swappable (see SPEC.md §Phase 3).
//
// Tasks:
//   quote — {items:[{name,qty,unit}], stores:["tesco",...]}
//           → live matched products + real totals per store (parallel, cached).
//   bag   — {items, store:"tesco", redirect_url?}
//           → {url} deferred deep link (Pepesto app fills the user's store basket,
//             mobile) + {adjust} web flow (buy.pepesto.com, desktop) + totals.
//
// Keyless mode: without PEPESTO_API_KEY every task returns {live:false} and the
// front-end falls back to reference prices + manual handoff links. The app stays
// fully usable before credits are bought.
//
// Secrets:  supabase secrets set PEPESTO_API_KEY=...
// Deploy:   supabase functions deploy checkout
// Note: confirm domain strings after buying a key:
//   curl https://api.pepesto.com/supermarkets -H "Authorization: Bearer $KEY"

import { withSupabase } from 'npm:@supabase/server'

const PEPESTO = 'https://s.pepesto.com/api'

// Plentry store id -> Pepesto supermarket domain.
const STORE_DOMAINS: Record<string, string> = {
  tesco: 'tesco.com',
  sains: 'sainsburys.co.uk',
  asda: 'asda.com',
  wait: 'waitrose.com',
}

// ---- tiny in-memory quote cache (saves credits; survives warm invocations) ----
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h — grocery prices don't move faster
const cache = new Map<string, { t: number; v: unknown }>()
const cacheGet = (k: string) => {
  const e = cache.get(k)
  if (e && Date.now() - e.t < CACHE_TTL_MS) return e.v
  cache.delete(k)
  return null
}
const cacheSet = (k: string, v: unknown) => {
  if (cache.size > 200) cache.delete(cache.keys().next().value as string)
  cache.set(k, { t: Date.now(), v })
}

type Item = { name: string; qty: number; unit?: string }

const listText = (items: Item[]) =>
  items
    .map((b) => `${Math.max(1, Math.round(+b.qty || 1))}x ${b.name}${b.unit ? ` (${b.unit} pack)` : ''}`)
    .join('\n')
    .slice(0, 5000)

async function pepesto(path: string, key: string, body: unknown) {
  const r = await fetch(`${PEPESTO}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`pepesto ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return await r.json()
}

// One /products call for one store. Returns normalized lines + totals.
async function matchStore(key: string, storeId: string, items: Item[]) {
  const domain = STORE_DOMAINS[storeId]
  if (!domain) return { ok: false, error: 'unknown_store' }
  const ck = `q:${domain}:${listText(items)}`
  const hit = cacheGet(ck)
  if (hit) return hit

  const res = await pepesto('/products', key, {
    manual_shopping_list: listText(items),
    supermarket_domain: domain,
    item_names_locale: 'en-GB',
  })

  const lines: unknown[] = []
  let total = 0
  const skus: { session_token: string; num_units_to_buy: number }[] = []
  for (const it of res.items || []) {
    const p = (it.products || [])[0] // best match first (Pepesto sorts)
    if (!p || !p.product) continue
    const units = p.num_units_to_buy > 0 ? p.num_units_to_buy : 1
    const pence = p.product.price?.price || 0
    total += pence * units
    if (p.session_token) skus.push({ session_token: p.session_token, num_units_to_buy: units })
    lines.push({
      item: it.item_name,
      product: p.product.product_name,
      units,
      pence,
      promo: !!p.product.price?.promotion?.promo,
      url: p.product.product_id || '',
      img: p.product.pepesto_hosted_image_url || p.product.image_url || '',
    })
  }
  const out = {
    ok: true,
    total, // smallest currency unit (pence), products only — store picks its delivery fee
    currency: res.currency || 'GBP',
    lines,
    unmatched: res.not_indexed_items || [],
    adjust: res.adjustments_url || '',
    skus, // reused by `bag` when fresh
  }
  cacheSet(ck, out)
  return out
}

export default {
  fetch: withSupabase({ auth: ['user', 'publishable'] }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 })

    const body = await req.json().catch(() => null)
    const { task, payload } = body || {}
    const p = payload || {}
    const items: Item[] = Array.isArray(p.items)
      ? p.items
          .filter((b: Item) => b && b.name)
          .slice(0, 50)
          .map((b: Item) => ({ name: String(b.name).slice(0, 60), qty: +b.qty || 1, unit: b.unit ? String(b.unit).slice(0, 20) : '' }))
      : []

    const key = Deno.env.get('PEPESTO_API_KEY')
    // Live calls cost real credits — require a signed-in user; otherwise fall back.
    if (!key || !ctx.userClaims) return Response.json({ live: false })
    if (!items.length) return Response.json({ error: 'no_items' }, { status: 400 })

    try {
      if (task === 'quote') {
        const stores: string[] = (Array.isArray(p.stores) && p.stores.length ? p.stores : Object.keys(STORE_DOMAINS)).slice(0, 6)
        const results = await Promise.all(
          stores.map(async (s) => {
            try {
              const { skus: _skus, ...pub } = (await matchStore(key, s, items)) as Record<string, unknown>
              return [s, pub]
            } catch (e) {
              console.error('quote', s, e)
              return [s, { ok: false }]
            }
          }),
        )
        return Response.json({ live: true, stores: Object.fromEntries(results) })
      }

      if (task === 'bag') {
        const storeId = String(p.store || '')
        const domain = STORE_DOMAINS[storeId]
        if (!domain) return Response.json({ error: 'unknown_store' }, { status: 400 })
        const m = (await matchStore(key, storeId, items)) as {
          ok: boolean; total: number; currency: string; lines: unknown[]; unmatched: string[]; adjust: string
          skus: { session_token: string; num_units_to_buy: number }[]
        }
        if (!m.ok) return Response.json({ error: 'match_failed' }, { status: 502 })
        const mc = await pepesto('/mcheckout', key, {
          supermarket_domain: domain,
          user_locale: 'en-GB',
          ...(p.redirect_url ? { redirect_url: String(p.redirect_url).slice(0, 300) } : {}),
          skus: m.skus,
          unresolved_items: m.unmatched.slice(0, 20),
        })
        return Response.json({
          live: true,
          url: mc.mobile_hosted_url || '',   // mobile: Pepesto app fills the user's store basket
          session: mc.session_id || '',
          adjust: m.adjust,                  // desktop: web flow at buy.pepesto.com
          total: m.total,
          currency: m.currency,
          matched: m.lines.length,
          unmatched: m.unmatched,
        })
      }

      return Response.json({ error: 'unknown task' }, { status: 400 })
    } catch (e) {
      console.error(e)
      return Response.json({ error: 'server', detail: String(e).slice(0, 200) }, { status: 500 })
    }
  }),
}
