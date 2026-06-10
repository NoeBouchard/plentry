# plentry.

**Your kitchen on autopilot.** AI meal planning that compares basket prices across local UK supermarkets (Tesco, Sainsbury's, Asda, Waitrose) and orders what your pantry is missing — delivered by the store itself. No boxes, no packing, no mark-ups.

## Status: MVP (static prototype)

- Signup / login (client-side beta auth — Supabase planned)
- 30-second onboarding: postcode, household, budget, diet, cuisines
- AI weekly meal plan (rule-based scorer over recipe DB — LLM planned)
- Pantry tracking with low-stock alerts; auto-replenishment into basket
- Multi-store price comparison with savings estimate
- Order flow: confirm price → basket locked → deep-link handoff to store checkout
  (direct retailer API ordering replaces the handoff in Phase 2)
- All state persisted in `localStorage`

## Run

It's a single static file — open `index.html`, or deploy anywhere static (Vercel).

## Roadmap

See `PLAN.md`. Next: real backend (Next.js + Postgres + LLM planner), live price data, retailer/aggregator ordering integrations (Everli, Wolt Market, retailer APIs).

## Name

Working name **Plentry** (plenty + pantry). "Forq" was dropped: forq.tech operates an AI food-delivery product with ™ branding.
