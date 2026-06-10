// Plentry AI endpoint — Claude Haiku (cheap: ~fractions of a penny per call).
// Configure: Vercel project env var ANTHROPIC_API_KEY.
// Tasks: parse_pantry | meal_options | recipe — all return strict JSON.

const MODEL = "claude-haiku-4-5-20251001";

const CATALOG = [
  "chicken thighs","salmon fillet","minced beef","halloumi","eggs","chickpeas",
  "rice","spaghetti","tortillas","coconut milk","curry paste","passata",
  "onions","garlic","bell peppers","broccoli","spinach","tomatoes",
  "lemons","potatoes","olive oil","feta","yoghurt","parmesan",
];

function prompts(task, p) {
  const cat = CATALOG.join(", ");
  if (task === "parse_pantry")
    return {
      system: "You convert a user's free-text description of their fridge/pantry into stock levels. Respond with ONLY valid JSON, no prose.",
      user: `Catalog (the ONLY allowed item names): ${cat}.
User's description of what they have at home:
"""${String(p.text || "").slice(0, 2000)}"""
Return JSON: {"pantry":{"<catalog item>":<fraction 0..1 of a typical pack they have>}}.
Map synonyms to catalog names (e.g. "pasta"->"spaghetti", "peppers"->"bell peppers", "tinned tomatoes"->"passata"). Skip anything not in the catalog. "some"/"half"≈0.5, "plenty"/"full"≈1, "a bit"/"almost out"≈0.2.`,
    };
  if (task === "meal_options")
    return {
      system: "You are a meal planner for a UK grocery app. Respond with ONLY valid JSON, no prose.",
      user: `Catalog (the ONLY allowed ingredients): ${cat}.
User pantry (fraction of pack in stock): ${JSON.stringify(p.pantry || {})}.
Household: ${p.size || 2} people. Budget: £${p.budget || 60}/week.
Propose ${p.count || 8} varied, creative dinner options. Favour (but don't force) recipes using pantry items. 4-8 ingredients each, all strictly from the catalog.${
        Array.isArray(p.exclude) && p.exclude.length
          ? `\nDo NOT propose any of these existing dishes (or close variants): ${p.exclude.join("; ")}.`
          : ""
      }
Return JSON: {"meals":[{"name":"...","emoji":"🍛","time":<minutes>,"ing":["catalog item",...]}]}`,
    };
  if (task === "recipe")
    return {
      system: "You are a concise, encouraging recipe writer. Respond with ONLY valid JSON, no prose.",
      user: `Write cooking instructions for "${p.name}" for ${p.servings || 2} people, using: ${(p.ing || []).join(", ")} (plus salt, pepper, basic spices).
Return JSON: {"steps":["step 1...","step 2...",...],"tip":"one short pro tip"}. 5-9 clear steps, each 1-2 sentences, with rough timings.`,
    };
  if (task === "advisor")
    return {
      system: `You are Plentry's friendly meal advisor for a UK grocery app. Your job: figure out what the user fancies this week, then propose dinners.
Rules:
- Ask AT MOST 2 short questions total (one per turn): things like mood, cravings, time to cook, anything to avoid. Be warm and brief.
- After 2 questions max (or sooner if you have enough), propose 4-6 dinner options.
- Every ingredient must come strictly from this catalog: ${cat}.
- ALWAYS respond with ONLY valid JSON: {"message":"<your short chat reply>","meals":[{"name":"...","emoji":"🍛","time":<minutes>,"ing":["catalog item",...]}]}
- While still asking questions, use "meals": [].
- When proposing, "message" should briefly introduce the options.`,
      messages: (p.messages || []).slice(-12).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 1000),
      })),
    };
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "ai_not_configured" });

  const { task, payload } = req.body || {};
  const pr = prompts(task, payload || {});
  if (!pr) return res.status(400).json({ error: "unknown task" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: pr.system,
        messages: pr.messages && pr.messages.length ? pr.messages : [{ role: "user", content: pr.user }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "upstream", detail: t.slice(0, 300) });
    }
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/); // tolerate stray prose
    if (!m) return res.status(502).json({ error: "no_json" });
    return res.status(200).json(JSON.parse(m[0]));
  } catch (e) {
    return res.status(500).json({ error: "server", detail: String(e).slice(0, 200) });
  }
};
