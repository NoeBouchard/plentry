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
async function writeMeals(sb: any, meals: any[], source: string) {
  if (!meals.length) return
  await sb.from('meals').upsert(
    meals.map((m) => ({
      name: String(m.name).slice(0, 60),
      emoji: m.emoji || '🍽️',
      time: +m.time || 25,
      ing: m.ing,
      source,
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
  if (task === 'meal_options')
    return {
      system: 'You are a meal planner for a UK grocery app. Respond with ONLY valid JSON, no prose.',
      user: `Catalog (the ONLY allowed ingredients): ${cat}.
User pantry (fraction of pack in stock): ${JSON.stringify(p.pantry || {})}.
Household: ${p.size || 2} people. Budget: £${p.budget || 60}/week.
Propose ${p.count || 8} varied, creative dinner options. Favour (but don't force) recipes using pantry items. 4-8 ingredients each, all strictly from the catalog.${
        Array.isArray(p.exclude) && p.exclude.length
          ? `\nDo NOT propose any of these existing dishes (or close variants): ${p.exclude.join('; ')}.`
          : ''
      }
Return JSON: {"meals":[{"name":"...","emoji":"🍛","time":<minutes>,"ing":["catalog item",...]}]}`,
    }
  if (task === 'recipe')
    return {
      system: 'You are a concise, encouraging recipe writer. Respond with ONLY valid JSON, no prose.',
      user: `Write cooking instructions for "${p.name}" for ${p.servings || 2} people, using: ${(p.ing || []).join(', ')} (plus salt, pepper, basic spices).
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
      if ((task === 'meal_options' || task === 'advisor') && signedIn && Array.isArray(out.meals)) {
        const fresh = out.meals.filter(VALID).filter((x: any) => !(p.exclude || []).includes(x.name))
        await writeMeals(ctx.supabase, fresh, task === 'advisor' ? 'advisor' : 'ai')
      }
      return Response.json(out)
    } catch (e) {
      return Response.json({ error: 'server', detail: String(e).slice(0, 200) }, { status: 500 })
    }
  }),
}
