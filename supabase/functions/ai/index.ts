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
// Tasks: parse_pantry | meal_options | recipe | advisor — all return strict JSON.

import { withSupabase } from 'npm:@supabase/server'
import { allow, clientIdent, TOO_MANY } from '../_shared/ratelimit.ts'

const MODEL = 'claude-haiku-4-5-20251001'

const CATALOG = [
  'chicken thighs', 'salmon fillet', 'minced beef', 'halloumi', 'eggs', 'chickpeas',
  'rice', 'spaghetti', 'tortillas', 'coconut milk', 'curry paste', 'passata',
  'onions', 'garlic', 'bell peppers', 'broccoli', 'spinach', 'tomatoes',
  'lemons', 'potatoes', 'olive oil', 'feta', 'yoghurt', 'parmesan',
  'chopped tomatoes', 'butter', 'fresh coriander',
  'salt', 'black pepper', 'paprika', 'cumin', 'chilli flakes', 'mixed herbs', 'soy sauce', 'stock cubes',
]

const VALID = (m: any) =>
  m && m.name && Array.isArray(m.ing) && m.ing.length && m.ing.every((i: string) => CATALOG.includes(i))

const MEAL_TAGS = [
  'vegetarian', 'vegan', 'meat', 'fish',
  'low_calorie', 'high_protein', 'low_carb',
  'breakfast', 'lunch', 'dinner', 'snack',
  'gym', 'meal_prep', 'quick', 'comfort_food',
] as const
const MEAT_ING = ['chicken thighs', 'minced beef']
const FISH_ING = ['salmon fillet']
const ANIMAL_ING = ['chicken thighs', 'minced beef', 'salmon fillet', 'eggs', 'feta', 'halloumi', 'yoghurt', 'parmesan', 'butter']
const PROTEIN_ING = ['chicken thighs', 'minced beef', 'salmon fillet', 'eggs', 'halloumi', 'yoghurt', 'chickpeas', 'feta']
const CARB_ING = ['rice', 'spaghetti', 'tortillas', 'potatoes']
const DIET_TAGS = ['vegetarian', 'vegan', 'meat', 'fish']
const GOAL_IDS = ['decide', 'shop', 'waste', 'budget', 'variety']
const TAG_LIST = MEAL_TAGS.join(', ')

function tagsFor(m: any): string[] {
  const ing: string[] = Array.isArray(m?.ing) ? m.ing : []
  const name = String(m?.name || '').toLowerCase()
  const time = Number(m?.time) || 25
  const has = (k: string) => ing.includes(k)
  const anyOf = (keys: string[]) => keys.some((k) => ing.includes(k))
  const tags: string[] = []
  if (anyOf(MEAT_ING)) tags.push('meat')
  else if (anyOf(FISH_ING)) tags.push('fish')
  else if (!anyOf(ANIMAL_ING)) tags.push('vegan')
  else tags.push('vegetarian')
  if (anyOf(PROTEIN_ING)) tags.push('high_protein')
  if (!anyOf(CARB_ING)) tags.push('low_carb')
  const diet = tags[0]
  if (
    (diet === 'vegan' || diet === 'vegetarian') &&
    !has('coconut milk') && !has('spaghetti') && !has('halloumi') && !has('feta') && !has('parmesan') &&
    time <= 25 && !/pasta|bake|fried rice|mash|curry|stew|meatball/.test(name)
  ) tags.push('low_calorie')
  tags.push('dinner')
  if (/omelette|shakshuka|frittata|baked eggs|spanish tortilla/.test(name)) tags.push('breakfast')
  if (/bowl|wrap|taco|salad|soup|omelette|fajita|frittata/.test(name)) tags.push('lunch')
  if (time <= 20) tags.push('quick')
  if (/curry|stew|rag[uù]|bolognese|traybake|casserole|keema|baked rice|soup/.test(name)) tags.push('meal_prep')
  if (tags.includes('high_protein') && (diet === 'meat' || diet === 'fish' || has('eggs') || has('halloumi'))) tags.push('gym')
  if (/pasta|spaghetti|curry|meatball|mash|bake|fried rice|shakshuka|parm|rag[uù]|stew|bolognese/.test(name)) tags.push('comfort_food')
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

// --- shared meals DB access (RLS-scoped via ctx.supabase) --------------------
async function readMealNames(sb: any): Promise<string[]> {
  const { data } = await sb.from('meals').select('name')
  return Array.isArray(data) ? data.map((r: any) => r.name) : []
}
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
    rows.push({
      name,
      emoji: clean(m.emoji || '🍽️', 8) || '🍽️',
      time: num(m.time, 1, 240, 25),
      ing: m.ing.slice(0, 20),
      tags: sanitizeTags(m),
      source,
      created_by: userId,
      image_url,
    })
  }
  await admin.from('meals').upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
  return rows
}

function prompts(task: string, p: any) {
  const cat = CATALOG.join(', ')
  if (task === 'parse_pantry')
    return {
      system: "You convert a user's free-text description of their fridge/pantry into stock levels. Respond with ONLY valid JSON, no prose.",
      user: `Catalog (the ONLY allowed item names): ${cat}.
User's description of what they have at home:
"""${String(p.text || '').slice(0, 2000)}"""
Return JSON: {"pantry":{"<catalog item>":<fraction 0..1 of a typical pack they have>}}.
Map synonyms to catalog names (e.g. "pasta"->"spaghetti", "peppers"->"bell peppers", "tinned tomatoes"->"chopped tomatoes", "coriander"->"fresh coriander"). Skip anything not in the catalog. "some"/"half"≈0.5, "plenty"/"full"≈1, "a bit"/"almost out"≈0.2.`,
    }
  if (task === 'meal_options') {
    // Every field below is attacker-controllable: clamp numbers, whitelist the
    // pantry to the catalog, and length-cap the exclude list before it reaches
    // the prompt (a negative "budget" or instruction-carrying string otherwise
    // lands verbatim in the LLM prompt).
    const size = ['1', '2', '3', '4+'].includes(String(p.size)) ? String(p.size) : '2'
    const budget = num(p.budget, 1, 500, 60)
    const count = num(p.count, 1, 12, 8)
    const pantry: Record<string, number> = {}
    for (const [k, v] of Object.entries(p.pantry || {}))
      if (CATALOG.includes(k)) pantry[k] = num(v, 0, 2, 0)
    const exclude = (Array.isArray(p.exclude) ? p.exclude : []).slice(0, 300).map((s: any) => clean(s, 60))
    return {
      system: 'You are a meal planner for a UK grocery app. Respond with ONLY valid JSON, no prose.',
      user: `Catalog (the ONLY allowed ingredients): ${cat}.
User pantry (fraction of pack in stock): ${JSON.stringify(pantry)}.
Household: ${size} people. Budget: £${budget}/week.
Propose ${count} varied, creative dinner options. Favour (but don't force) recipes using pantry items. 6-16 ingredients each, all strictly from the catalog.
The ing array MUST be the complete shopping list for that dinner: salt, black pepper, and every spice, oil, or sauce the method uses. Use \`chopped tomatoes\` for a 400g tin, \`tomatoes\` for fresh, \`passata\` for sieved tomato sauce. Do not assume extra pantry items.
Every meal MUST include a tags array. Use ONLY these tags (several per meal): ${TAG_LIST}. Exactly one of vegetarian|vegan|meat|fish. Always include dinner. Add nutrition / context / use-case tags that actually fit.${
        exclude.length
          ? `\nDo NOT propose any of these existing dishes (or close variants): ${exclude.join('; ')}.`
          : ''
      }
Return JSON: {"meals":[{"name":"...","emoji":"🍛","time":<minutes>,"ing":["catalog item",...],"tags":["dinner","meat"]}]}`,
    }
  }
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
- Tags: use ONLY this closed set (several per meal): ${TAG_LIST}. Exactly one of vegetarian|vegan|meat|fish. Always include dinner. Match nutrition / meal-context / use-case tags to the ingredients and name.
- Prefer existing catalog dinners that match the user's request and tags. Only invent a new dish if nothing listed fits.
- ALWAYS respond with ONLY valid JSON: {"message":"<your short chat reply>","meals":[{"name":"...","emoji":"🍛","time":<minutes>,"ing":["catalog item",...],"tags":["dinner","meat"]}]}
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

    // This endpoint accepts the PUBLIC publishable key (must work logged out), so
    // it's open to anyone with the browser app's key. Rate-limit by user/IP to
    // stop anonymous cost abuse. 40 calls / minute is plenty for real use.
    if (!(await allow(ctx.supabaseAdmin, 'ai', clientIdent(req, ctx), 40, 60))) return TOO_MANY()

    const body = await req.json().catch(() => null)
    const { task, payload } = body || {}
    const p = payload || {}

    // Signed-in users get DB-aware behaviour; logged-out callers skip it.
    const signedIn = !!ctx.userClaims

    // Consult the shared meals DB before proposing, so it never re-invents
    // what already exists. Advisor also gets tagged catalog rows to recommend.
    if (task === 'meal_options' && signedIn) {
      const known = await readMealNames(ctx.supabase)
      p.exclude = [...new Set([...(p.exclude || []), ...known])]
    }
    if (task === 'advisor' && signedIn) {
      const { data } = await ctx.supabase.from('meals').select('name,emoji,time,ing,tags').limit(80)
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
        return Response.json({ error: 'upstream', detail: t.slice(0, 300) }, { status: 502 })
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
        out.meals = out.meals.map((m: any) => (VALID(m) ? { ...m, tags: sanitizeTags(m) } : m))
      }
      if ((task === 'meal_options' || task === 'advisor') && signedIn && Array.isArray(out.meals)) {
        const fresh = out.meals.filter(VALID).filter((x: any) => !(p.exclude || []).includes(x.name))
        const saved = await writeMeals(ctx.supabaseAdmin, fresh, task === 'advisor' ? 'advisor' : 'ai', ctx.userClaims?.sub || null)
        const byName = Object.fromEntries((saved || []).map((r) => [r.name, r.image_url]))
        out.meals = out.meals.map((m: any) => (byName[m.name] ? { ...m, image_url: byName[m.name] } : m))
      }
      return Response.json(out)
    } catch (e) {
      return Response.json({ error: 'server', detail: String(e).slice(0, 200) }, { status: 500 })
    }
  }),
}
