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
]

const VALID = (m: any) =>
  m && m.name && Array.isArray(m.ing) && m.ing.length && m.ing.every((i: string) => CATALOG.includes(i))

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
  if (!meals.length) return
  await admin.from('meals').upsert(
    meals.map((m) => ({
      name: clean(m.name, 60),
      emoji: clean(m.emoji || '🍽️', 8) || '🍽️',
      time: num(m.time, 1, 240, 25),
      ing: m.ing.slice(0, 15),
      source,
      created_by: userId,
    })),
    { onConflict: 'name', ignoreDuplicates: true },
  )
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
Map synonyms to catalog names (e.g. "pasta"->"spaghetti", "peppers"->"bell peppers", "tinned tomatoes"->"passata"). Skip anything not in the catalog. "some"/"half"≈0.5, "plenty"/"full"≈1, "a bit"/"almost out"≈0.2.`,
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
Propose ${count} varied, creative dinner options. Favour (but don't force) recipes using pantry items. 4-8 ingredients each, all strictly from the catalog.${
        exclude.length
          ? `\nDo NOT propose any of these existing dishes (or close variants): ${exclude.join('; ')}.`
          : ''
      }
Return JSON: {"meals":[{"name":"...","emoji":"🍛","time":<minutes>,"ing":["catalog item",...]}]}`,
    }
  }
  if (task === 'recipe')
    return {
      system: 'You are a concise, encouraging recipe writer. Respond with ONLY valid JSON, no prose.',
      user: `Write cooking instructions for "${clean(p.name, 80)}" for ${num(p.servings, 1, 12, 2)} people, using: ${(Array.isArray(p.ing) ? p.ing : []).filter((i: string) => CATALOG.includes(i)).join(', ')} (plus salt, pepper, basic spices).
Return JSON: {"steps":["step 1...","step 2...",...],"tip":"one short pro tip"}. 5-9 clear steps, each 1-2 sentences, with rough timings.`,
    }
  if (task === 'advisor')
    return {
      system: `You are Plentry's friendly meal advisor for a UK grocery app. Your job: figure out what the user fancies this week, then propose dinners.
Rules:
- Ask AT MOST 2 short questions total (one per turn): things like mood, cravings, time to cook, anything to avoid. Be warm and brief.
- After 2 questions max (or sooner if you have enough), propose 4-6 dinner options.
- Every ingredient must come strictly from this catalog: ${cat}.
- ALWAYS respond with ONLY valid JSON: {"message":"<your short chat reply>","meals":[{"name":"...","emoji":"🍛","time":<minutes>,"ing":["catalog item",...]}]}
- While still asking questions, use "meals": [].
- When proposing, "message" should briefly introduce the options.`,
      messages: (p.messages || []).slice(-12).map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 1000),
      })),
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
    // what already exists.
    if (task === 'meal_options' && signedIn) {
      const known = await readMealNames(ctx.supabase)
      p.exclude = [...new Set([...(p.exclude || []), ...known])]
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
          max_tokens: 1500,
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
      if ((task === 'meal_options' || task === 'advisor') && signedIn && Array.isArray(out.meals)) {
        const fresh = out.meals.filter(VALID).filter((x: any) => !(p.exclude || []).includes(x.name))
        await writeMeals(ctx.supabaseAdmin, fresh, task === 'advisor' ? 'advisor' : 'ai', ctx.userClaims?.sub || null)
      }
      return Response.json(out)
    } catch (e) {
      return Response.json({ error: 'server', detail: String(e).slice(0, 200) }, { status: 500 })
    }
  }),
}
