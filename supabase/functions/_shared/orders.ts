// Shared, pure order helpers for Plentry edge functions (pay, stripe-webhook,
// notify-order). No `npm:` imports so `npm test` can load this file in Node.
//
// Security audit 17 Sep 2026:
//   S-04  Ops and Telegram must never act on client-written basket text. `pay`
//         rebuilds items.basket from the catalog + ingredient_prices and writes
//         it back before the hold; Telegram rebuilds every search URL from a
//         store whitelist instead of trusting `b.search`.
//   S-05  stripe-webhook only writes a UK-shaped postcode (the DB trigger
//         rejects anything else and the event would be lost).

// Catalog keys. MUST equal `CATALOG` in ai/index.ts and the keys of
// `INGREDIENTS` in index.html (contracts test guards all three).
export const CATALOG = [
  'chicken thighs', 'salmon fillet', 'minced beef', 'halloumi', 'eggs', 'chickpeas',
  'rice', 'spaghetti', 'tortillas', 'coconut milk', 'curry paste', 'passata',
  'onions', 'garlic', 'bell peppers', 'broccoli', 'spinach', 'tomatoes',
  'lemons', 'potatoes', 'olive oil', 'feta', 'yoghurt', 'parmesan',
  'chopped tomatoes', 'butter', 'fresh coriander',
  'salt', 'black pepper', 'paprika', 'cumin', 'chilli flakes', 'mixed herbs', 'soy sauce', 'stock cubes',
]
const CATALOG_SET = new Set(CATALOG)

// Store name (as stored on orders) -> public search URL. Same four stores as
// STORES[] in index.html. Anything else gets no link at all.
export const STORE_SEARCH: Record<string, string> = {
  'Tesco': 'https://www.tesco.com/groceries/en-GB/search?query={q}',
  "Sainsbury's": 'https://www.sainsburys.co.uk/gol-ui/SearchResults/{q}',
  'Asda': 'https://groceries.asda.com/search/{q}',
  'Waitrose': 'https://www.waitrose.com/ecom/shop/search?&searchTerm={q}',
}

export function searchUrl(store: unknown, term: unknown): string | null {
  const tpl = STORE_SEARCH[String(store ?? '')]
  if (!tpl) return null
  const q = String(term ?? '').trim().slice(0, 80)
  if (!q) return null
  return tpl.replace('{q}', encodeURIComponent(q))
}

// UK postcode (permissive official pattern). Returns "E2 8AA" or null.
export function ukPostcode(v: unknown): string | null {
  const p = String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/.test(p)) return null
  return p.includes(' ') ? p : `${p.slice(0, -3)} ${p.slice(-3)}`
}

// Strip markup-significant chars and cap length (same idea as ai/index.ts clean()).
export const clean = (s: unknown, n: number) => String(s ?? '').replace(/[<>"'`]/g, '').trim().slice(0, n)

export type PriceRow = {
  meal_key?: string | null
  display_name?: string | null
  product_name?: string | null
  pack_size?: string | null
  price_gbp?: number | string | null
}

export type BasketLine = {
  i: string
  q: number
  product: string | null
  pack: string | null
  unit: string | null
  shelf_price: number | null
  search: string | null
}

export const FALLBACK_ITEM_GBP = 2.5 // catalog item with no shelf row at this store
export const MAX_BASKET_LINES = 60
export const MAX_LINE_QTY = 50

function priceIndex(rows: PriceRow[]): Record<string, PriceRow> {
  const idx: Record<string, PriceRow> = {}
  for (const r of rows || []) {
    const k = r.meal_key || String(r.display_name || '').toLowerCase()
    if (k && !idx[k]) idx[k] = r
  }
  return idx
}

// Rebuild the basket from what the server knows. Only catalog keys survive;
// product / pack / price / search all come from ingredient_prices + the store
// whitelist, never from the client. Duplicate keys are merged.
export function rebuildBasket(
  raw: unknown,
  rows: PriceRow[],
  store: unknown,
): { basket: BasketLine[] } | { error: string } {
  if (!Array.isArray(raw) || !raw.length) return { error: 'basket empty' }
  if (raw.length > MAX_BASKET_LINES) return { error: 'basket too large' }
  const qty: Record<string, number> = {}
  const order: string[] = []
  for (const b of raw) {
    const i = String((b as any)?.i ?? '').trim().toLowerCase()
    if (!CATALOG_SET.has(i)) return { error: `unknown item: ${clean(i, 40) || '(blank)'}` }
    const q = Math.min(MAX_LINE_QTY, Math.max(1, Math.round(Number((b as any)?.q) || 1)))
    if (!(i in qty)) order.push(i)
    qty[i] = Math.min(MAX_LINE_QTY, (qty[i] || 0) + q)
  }
  const idx = priceIndex(rows)
  const basket = order.map((i) => {
    const r = idx[i]
    const price = r && Number.isFinite(Number(r.price_gbp)) ? Number(r.price_gbp) : null
    const product = r?.product_name ? clean(r.product_name, 80) || null : null
    const pack = r?.pack_size ? clean(r.pack_size, 40) || null : null
    return {
      i,
      q: qty[i],
      product,
      pack,
      unit: pack,
      shelf_price: price,
      search: searchUrl(store, product || i),
    }
  })
  return { basket }
}

// Grocery estimate for a rebuilt basket (no delivery fee).
export function basketTotal(basket: BasketLine[]): number {
  let t = 0
  for (const b of basket) t += b.q * (b.shelf_price ?? FALLBACK_ITEM_GBP)
  return Math.round(t * 100) / 100
}

// Meal names shown to Ops / Telegram: bounded, markup-free.
export function cleanMeals(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).slice(0, 7).map((m) => clean(m, 60)).filter(Boolean)
}

export const MAX_RECIPE_STEPS = 12
export const MAX_RECIPE_STEP = 400
export const MAX_RECIPE_TIP = 200

export type OrderRecipe = {
  name: string
  emoji: string
  time: number
  ing: string[]
  recipe: { steps: string[]; tip: string } | null
}

// Cooking method snapshotted onto the order so the customer can still read it
// after the week moves on or a catalog dinner is edited. First matching name
// wins — pass catalog rows before client-written ones. Markup stripped.
export function cleanRecipes(raw: unknown, mealNames?: unknown): OrderRecipe[] {
  const names = cleanMeals(mealNames)
  const list = Array.isArray(raw) ? raw : []
  const byName: Record<string, any> = {}
  for (const row of list) {
    const name = clean((row as any)?.name, 60)
    if (name && !byName[name]) byName[name] = row
  }
  const keys = names.length
    ? names
    : list.slice(0, 7).map((r) => clean((r as any)?.name, 60)).filter(Boolean)
  return keys.map((name) => {
    const row = byName[name] || {}
    const emoji = clean(row.emoji || '🍽️', 8) || '🍽️'
    const time = Math.min(180, Math.max(1, Math.round(Number(row.time) || 25)))
    const seen: Record<string, 1> = {}
    const ing: string[] = []
    for (const x of Array.isArray(row.ing) ? row.ing : []) {
      const i = String(x ?? '').trim().toLowerCase()
      if (CATALOG_SET.has(i) && !seen[i]) { seen[i] = 1; ing.push(i) }
      if (ing.length >= 20) break
    }
    const rec = row.recipe && typeof row.recipe === 'object' ? row.recipe : row
    const stepsRaw = Array.isArray((rec as any)?.steps) ? (rec as any).steps : []
    const steps = stepsRaw.map((s: unknown) => clean(s, MAX_RECIPE_STEP)).filter(Boolean).slice(0, MAX_RECIPE_STEPS)
    const tip = clean((rec as any)?.tip, MAX_RECIPE_TIP)
    return { name, emoji, time, ing, recipe: steps.length ? { steps, tip } : null }
  })
}
