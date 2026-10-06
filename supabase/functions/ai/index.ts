// Plentry AI endpoint — Claude Haiku (cheap: ~fractions of a penny per call).
// Migrated from Vercel (api/ai.js) to a Supabase Edge Function.
//
// Auth: ['user', 'publishable'] — works logged in OR logged out, matching the
// old behaviour. When a user JWT is present, ctx.supabase is scoped to that
// user so the shared meals table (RLS) can be read/written on their behalf.
// When logged out, it falls back to the publishable key and DB writes are
// simply skipped (same as before, when no accessToken was sent).
//
// Secret needed:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Deploy:         supabase functions deploy ai
// Tasks: recipe | advisor — both return strict JSON.
// Retired 17 Sep 2026 (S-11): parse_pantry and meal_options. The client stopped
// calling them on 8-9 Sep; keeping them live only left an unused LLM path open
// to anyone holding the publishable key. They now return 400.

import { withSupabase } from 'npm:@supabase/server'
import { allow, clientIdent, TOO_MANY } from '../_shared/ratelimit.ts'

const MODEL = 'claude-haiku-4-5-20251001'

const CATALOG = [
  'chicken thighs', 'salmon fillet', 'minced beef', 'halloumi', 'eggs', 'chickpeas',
  'rice', 'spaghetti', 'tortillas', 'coconut milk', 'curry paste', 'passata',
  'onions', 'garlic', 'bell peppers', 'broccoli', 'spinach', 'tomatoes',
  'lemons', 'potatoes', 'olive oil', 'feta', 'yoghurt', 'parmesan',
  'chopped tomatoes', 'butter', 'fresh coriander',
  'tomato puree', 'fresh ginger', 'garam masala', 'limes', 'spring onions',
  'penne', 'arborio rice', 'fresh basil', 'cucumber', 'red onions', 'cheddar',
  'salt', 'black pepper', 'paprika', 'cumin', 'chilli flakes', 'mixed herbs', 'soy sauce', 'stock cubes',
]

const PORTION_UNITS = ['g', 'ml', 'pc', 'clove', 'tbsp', 'tsp']
const portionOk = (p: any) => {
  if (p == null) return true
  if (typeof p !== 'object' || Array.isArray(p)) return false
  const keys = Object.keys(p)
  if (keys.length > 24) return false
  return keys.every((k) => {
    const v = p[k]
    return CATALOG.includes(k) && Array.isArray(v) && v.length >= 2
      && Number.isFinite(Number(v[0])) && Number(v[0]) >= 0 && Number(v[0]) <= 5000
      && PORTION_UNITS.includes(String(v[1]))
  })
}
const cleanPortions = (p: any) => {
  if (!portionOk(p) || p == null) return null
  const out: Record<string, [number, string]> = {}
  for (const k of Object.keys(p)) out[k] = [Math.round(Number(p[k][0]) * 100) / 100, String(p[k][1])]
  return Object.keys(out).length ? out : null
}
const VALID = (m: any) =>
  m && m.name && Array.isArray(m.ing) && m.ing.length && m.ing.every((i: string) => CATALOG.includes(i)) && portionOk(m.portions)

const MEAL_TAGS = [
  'vegetarian', 'vegan', 'meat', 'fish',
  'low_calorie', 'high_protein', 'low_carb',
  'dinner', 'meal_prep', 'quick', 'comfort_food',
] as const
const MEAL_CATEGORIES = [
  'pasta', 'rice_bowl', 'tacos_wraps', 'curry_stew', 'oven_bake', 'eggs', 'salad',
] as const
const MEAT_ING = ['chicken thighs', 'minced beef']
const FISH_ING = ['salmon fillet']
const ANIMAL_ING = ['chicken thighs', 'minced beef', 'salmon fillet', 'eggs', 'feta', 'halloumi', 'yoghurt', 'parmesan', 'butter', 'cheddar']
const PROTEIN_ING = ['chicken thighs', 'minced beef', 'salmon fillet', 'eggs', 'halloumi', 'yoghurt', 'chickpeas', 'feta']
const CARB_ING = ['rice', 'spaghetti', 'tortillas', 'potatoes']
const DIET_TAGS = ['vegetarian', 'vegan', 'meat', 'fish']
const GOAL_IDS = ['decide', 'shop', 'waste', 'budget', 'variety']
const TAG_LIST = MEAL_TAGS.join(', ')
const CATEGORY_LIST = MEAL_CATEGORIES.join(', ')

function tagsFor(m: any): string[] {
  const ing: string[] = Array.isArray(m?.ing) ? m.ing : []
  const time = Number(m?.time) || 25
  const anyOf = (keys: string[]) => keys.some((k) => ing.includes(k))
  const tags: string[] = []
  if (anyOf(MEAT_ING)) tags.push('meat')
  else if (anyOf(FISH_ING)) tags.push('fish')
  else if (!anyOf(ANIMAL_ING)) {tags.push('vegan'); tags.push('vegetarian')}
  else tags.push('vegetarian')
  tags.push('dinner')
  if (time < 30) tags.push('quick')
  return [...new Set(tags)]
}

function sanitizeTags(m: any): string[] {
  const inferred = tagsFor(m)
  const diet = inferred.find((t) => DIET_TAGS.includes(t)) || 'vegetarian'
  const fromAi = (Array.isArray(m?.tags) ? m.tags : [])
    .map((t: any) => String(t))
    .filter((t: string) => (MEAL_TAGS as readonly string[]).includes(t) && !DIET_TAGS.includes(t))
  return [...new Set([diet, ...fromAi, ...inferred.filter((t) => t !== diet)])].slice(0, 12)
}

const PHOTO: Record<string, string> = {
  'chicken thighs': 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&w=800&h=520&q=80',
  'salmon fillet': 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&h=520&q=80',
  'minced beef': 'https://images.unsplash.com/photo-1551892374-ecf8754cf8b0?auto=format&fit=crop&w=800&h=520&q=80',
  halloumi: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&h=520&q=80',
  eggs: 'https://images.unsplash.com/photo-1590412200988-a436970781fa?auto=format&fit=crop&w=800&h=520&q=80',
  chickpeas: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=800&h=520&q=80',
  spaghetti: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&h=520&q=80',
  rice: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=800&h=520&q=80',
  tortillas: 'https://images.unsplash.com/photo-1551504734-5ee1c36e3989?auto=format&fit=crop&w=800&h=520&q=80',
  potatoes: 'https://images.unsplash.com/photo-1608039829572-dee9b9547d0d?auto=format&fit=crop&w=800&h=520&q=80',
  tomatoes: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=800&h=520&q=80',
  'chopped tomatoes': 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=800&h=520&q=80',
  broccoli: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&h=520&q=80',
  spinach: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=800&h=520&q=80',
  passata: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&h=520&q=80',
  'curry paste': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&h=520&q=80',
  'coconut milk': 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=800&h=520&q=80',
  feta: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&h=520&q=80',
}
const PHOTO_FALLBACK = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&h=520&q=80'
function photoFor(m: any) {
  const ing: string[] = Array.isArray(m?.ing) ? m.ing : []
  for (const i of Object.keys(PHOTO)) if (ing.includes(i)) return PHOTO[i]
  return PHOTO_FALLBACK
}

// Unique photo per dish name, fetched ONCE when the meal is first saved.
// No cron: the URL lives on meals.image_url until we change it by hand.
const PHOTO_STOP = new Set(['with', 'and', 'the', 'style', 'from', 'over', 'into', 'plus'])
function searchTerms(name: string): string[] {
  const cleaned = String(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const words = cleaned.split(' ').filter((w) => w.length > 3 && !PHOTO_STOP.has(w))
  const out: string[] = []
  if (words[0]) out.push(words[0])
  if (words.length >= 2) out.push(`${words[0]} ${words[1]}`)
  if (cleaned) out.push(cleaned.slice(0, 48))
  return [...new Set(out)].slice(0, 3)
}
function nameHash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
async function searchMealDb(term: string): Promise<string[]> {
  try {
    const r = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return []
    const d = await r.json()
    const meals = Array.isArray(d?.meals) ? d.meals : []
    return meals.map((x: any) => String(x.strMealThumb || '')).filter((u: string) => /^https:\/\//i.test(u))
  } catch {
    return []
  }
}
async function photoForMeal(m: any): Promise<string> {
  const name = String(m?.name || '')
  for (const term of searchTerms(name)) {
    const urls = await searchMealDb(term)
    if (urls.length) return urls[nameHash(name) % urls.length]
  }
  return photoFor(m)
}

// Tasks the client no longer sends; explicit 400 so nobody can use the LLM budget
// through them (the prompt text was deleted, not just hidden).
const RETIRED_TASKS = ['parse_pantry', 'meal_options']
// Per-user cap on NEW catalog drafts per day (S-11). Advisor proposes 4-6 dishes
// per conversation; 20 fresh names/day is ample and bounds newcoming spam.
const DRAFTS_PER_USER_PER_DAY = 20

// Strip markup-significant chars so nothing that lands in the shared catalog can
// carry HTML. ing is already whitelisted to CATALOG by VALID().
const clean = (s: any, n: number) => String(s ?? '').replace(/[<>"'`]/g, '').slice(0, n)
// Clamp any client-supplied number into a sane range (rejects NaN/strings).
const num = (v: any, lo: number, hi: number, dflt: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}
// Writes go through the SERVICE ROLE: the client-side INSERT policy on meals
// was dropped (security_hardening_v2.sql) so this function is the only writer.
// created_by is set from the verified JWT — never from the payload.
async function writeMeals(admin: any, meals: any[], source: string, userId: string | null) {
  if (!meals.length) return [] as { name: string; image_url: string }[]
  const rows = []
  for (const m of meals) {
    const name = clean(m.name, 60)
    const image_url = await photoForMeal(m)
    const portions = cleanPortions(m.portions)
    rows.push({
      name,
      emoji: clean(m.emoji || '🍽️', 8) || '🍽️',
      time: num(m.time, 1, 240, 25),
      ing: m.ing.slice(0, 20),
      tags: sanitizeTags(m),
      source,
      created_by: userId,
      image_url,
      ...(portions ? { portions } : {}),
    })
  }
  await admin.from('meals').upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
  return rows
}

function prompts(task: string, p: any) {
  const cat = CATALOG.join(', ')
  if (task === 'recipe')
    return {
      system: 'You are a concise, encouraging recipe writer. Respond with ONLY valid JSON, no prose.',
      user: `Write cooking instructions for "${clean(p.name, 80)}" for ${num(p.servings, 1, 12, 2)} people.
This is the complete ingredient list — use every item, including salt and spices; do not add anything else: ${(Array.isArray(p.ing) ? p.ing : []).filter((i: string) => CATALOG.includes(i)).join(', ')}.
Return JSON: {"steps":["step 1...","step 2...",...],"tip":"one short pro tip"}. 5-9 clear steps, each 1-2 sentences, with rough timings.`,
    }
  if (task === 'advisor') {
    const goals = (Array.isArray(p.goals) ? p.goals : []).map((g: any) => String(g)).filter((g: string) => GOAL_IDS.includes(g)).slice(0, 8)
    const catalog = (Array.isArray(p.catalog) ? p.catalog : []).slice(0, 80)
      .map((m: any) => `${clean(m.name, 60)} (${num(m.time, 1, 240, 25)}m): ${sanitizeTags(m).join(',')}`)
      .join('\n')
    return {
      system: `You are Plentry's friendly meal advisor for a UK grocery app. Your job: figure out what the user fancies this week, then propose dinners.
Rules:
- Ask AT MOST 2 short questions total (one per turn): things like mood, cravings, time to cook, anything to avoid. Be warm and brief.
- After 2 questions max (or sooner if you have enough), propose 4-6 dinner options.
- Every ingredient must come strictly from this catalog: ${cat}.
- Each dinner's ing array is the FULL shopping list for that recipe, including salt, black pepper, and any spices, oils, or sauces used. 6-16 ingredients. Use chopped tomatoes for a tin, tomatoes for fresh. Do not assume extra pantry items.
- portions: the amount of each grocery for 2 servings, same catalog keys as ing. Shape {"minced beef":[400,"g"],"onions":[1,"pc"]}. Units only: g, ml, pc, clove, tbsp, tsp. Seasonings may be omitted. Omit portions entirely if you are unsure — never invent a unit.
- Tags: use ONLY this closed set (several per meal): ${TAG_LIST}. Exactly one of vegetarian|vegan|meat|fish. Always include dinner. Match nutrition / meal-context / use-case tags to the ingredients and name.
- Prefer existing catalog dinners that match the user's request and tags. Only invent a new dish if nothing listed fits.
- ALWAYS respond with ONLY valid JSON: {"message":"<your short chat reply>","meals":[{"name":"...","emoji":"🍛","time":<minutes>,"ing":["catalog item",...],"tags":["dinner","meat"],"portions":{"catalog item":[400,"g"]}}]}
- While still asking questions, use "meals": [].
- When proposing, "message" should briefly introduce the options.
User onboarding goals: ${goals.length ? goals.join(', ') : 'none given'}.
Existing catalog (name, time, tags):
${catalog || '(empty)'}`,
      messages: (p.messages || []).slice(-12).map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 1000),
      })),
    }
  }
  return null
}

export default {
  fetch: withSupabase({ auth: ['user', 'publishable'] }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 })

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return Response.json({ error: 'ai_not_configured' }, { status: 503 })

    // Signed-in users get DB-aware behaviour; logged-out callers skip it.
    const signedIn = !!ctx.userClaims

    // This endpoint accepts the PUBLIC publishable key (must work logged out), so
    // it's open to anyone with the browser app's key. Rate-limit by user/IP to
    // stop anonymous cost abuse. 40 calls / minute is plenty for real use.
    // Anonymous callers fail CLOSED if the limiter is unavailable (S-03).
    if (!(await allow(ctx.supabaseAdmin, 'ai', clientIdent(req, ctx), 40, 60, signedIn))) return TOO_MANY()

    const body = await req.json().catch(() => null)
    const { task, payload } = body || {}
    const p = payload || {}
    if (RETIRED_TASKS.includes(task)) return Response.json({ error: 'retired task' }, { status: 400 })

    // Advisor gets the PUBLISHED catalog (reviewed_at set) to recommend from —
    // never the unreviewed newcoming queue, which any signed-in user can grow.
    if (task === 'advisor' && signedIn) {
      const { data } = await ctx.supabase.from('meals').select('name,emoji,time,ing,tags')
        .not('reviewed_at', 'is', null).limit(80)
      p.catalog = Array.isArray(data) ? data : []
    }

    const pr = prompts(task, p)
    if (!pr) return Response.json({ error: 'unknown task' }, { status: 400 })

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system: pr.system,
          messages: pr.messages && pr.messages.length ? pr.messages : [{ role: 'user', content: pr.user }],
        }),
      })
      if (!r.ok) {
        const t = await r.text()
        console.error('ai upstream', r.status, t.slice(0, 300))
        // S-15: upstream bodies (model names, quota text) only go to signed-in users.
        return Response.json({ error: 'upstream', ...(signedIn ? { detail: t.slice(0, 300) } : {}) }, { status: 502 })
      }
      const data = await r.json()
      const text = (data.content || []).map((c: any) => c.text || '').join('')
      const m = text.match(/\{[\s\S]*\}/) // tolerate stray prose
      if (!m) return Response.json({ error: 'no_json' }, { status: 502 })
      const out = JSON.parse(m[0])

      // Grow the catalog: persist any valid new dishes the AI produced.
      // Service-role write (clients can no longer INSERT meals directly).
      // New rows keep reviewed_at NULL (newcoming) until Ops marks them.
      if (Array.isArray(out.meals)) {
        out.meals = out.meals.map((m: any) => {
          if (m && m.portions != null && !portionOk(m.portions)) {
            const copy = { ...m }
            delete copy.portions
            m = copy
          }
          return VALID(m) ? { ...m, tags: sanitizeTags(m) } : m
        })
      }
      if (task === 'advisor' && signedIn && Array.isArray(out.meals)) {
        const uid = ctx.userClaims?.sub || null
        const valid = out.meals.filter(VALID)
        // Only names the catalog does not have yet count against the daily draft
        // quota (S-11); existing dishes are simply re-used.
        const names = valid.map((m: any) => clean(m.name, 60)).filter(Boolean)
        const { data: existing } = names.length
          ? await ctx.supabaseAdmin.from('meals').select('name').in('name', names)
          : { data: [] }
        const have = new Set((existing || []).map((r: any) => r.name))
        const fresh: any[] = []
        for (const m of valid) {
          if (have.has(clean(m.name, 60))) continue
          // one quota unit per new dish; fail CLOSED (no persist) if the limiter is down
          if (!(await allow(ctx.supabaseAdmin, 'ai_drafts', String(uid), DRAFTS_PER_USER_PER_DAY, 86400, false))) break
          fresh.push(m)
        }
        const saved = await writeMeals(ctx.supabaseAdmin, fresh, 'advisor', uid)
        const byName = Object.fromEntries((saved || []).map((r) => [r.name, r.image_url]))
        out.meals = out.meals.map((m: any) => (byName[m.name] ? { ...m, image_url: byName[m.name] } : m))
      }
      return Response.json(out)
    } catch (e) {
      console.error('ai server', String(e).slice(0, 300))
      return Response.json({ error: 'server', ...(signedIn ? { detail: String(e).slice(0, 200) } : {}) }, { status: 500 })
    }
  }),
}
