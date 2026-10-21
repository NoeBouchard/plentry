# Meal tags

Closed set. A meal can have **several**. Same list in `plentry/index.html` (`MEAL_TAGS`), `plentry/supabase/functions/ai/index.ts`, and `meals.tags` (jsonb, constrained).

## Diet / preference (exactly one)

- `vegetarian`
- `vegan`
- `meat`
- `fish`

**Vegan dishes carry BOTH `vegan` AND `vegetarian` tags.** Client "veggie" matching should treat vegetarian **or** vegan as a hit. New week / Modify default to **omnivore** (prefer `meat`/`fish`, cap vegetarian/vegan) until `prefs.diet` is set.

## Nutrition / goal

- `low_calorie`
- `high_protein`
- `low_carb`

**UI visibility:** `low_carb` and `low_calorie` are hidden from onboarding/prefs chips until each has ≥ 8 live meals, but kept for users who already selected them.

## Meal context

- `dinner` (always on catalog dinners; hidden constant, not shown in UI tag lists)

## Use case

- `meal_prep`
- `quick` (total time < 30 min)
- `comfort_food`

## Categories

Every verified meal has exactly one category from:

- `pasta`
- `rice_bowl`
- `oven_bake` (traybakes & bakes)
- `tacos_wraps`
- `curry_stew`
- `eggs`
- `salad`

Stored in `meals.category` (CHECK constraint). Category is allowed to be null when `reviewed_at` is null (draft meals). The Meals admin UI requires a category to Verify & publish.

## Live catalog (21 Oct 2026)

77 rows. **52 reviewed:** **21 meat**, **8 fish**, **17 vegetarian**, **6 vegan**. The other 25 are unpublished and stay off New week. Vegetarian New week can also use the 6 vegan dinners (23). Pescatarian drops the 21 meat dinners (31). The 6 Oct 2026 backfill had all 77 reviewed (33 meat, 11 fish, 28 vegetarian, 5 vegan); some have since been unpublished.

## How they get set

- **Tags are stored data** that is never recomputed on update. The DB only derives diet (`meat`/`fish`/`vegetarian`+`vegan`), `quick` (time < 30), and `dinner` via `meal_tags_for` and a trigger. `meal_prep`, `comfort_food`, and the nutrition tags are curated, so catalog patches must not wipe them.
- **Current 77:** backfilled from curated tag assignments (catalog migration 6 Oct 2026, `meals_categories_tags_ingredients_v2.sql`).
- **Advisor / AI inserts:** the model must return `tags` and `category`; the `ai` function **whitelists** both and fills diet/quick/dinner from ingredients so a row is never stored without tags. `reviewed_at` stays null (**New meal**) until the founder verifies it on the Meals tab.

## User prefs (`prefs.tags`)

Onboarding dinner tags and Profile → Dinner tags store a subset of the use-case/nutrition tags (`quick`, `high_protein`, `low_calorie`, `low_carb`, `comfort_food`). `meal_prep` is not offered unless it is already saved, so a legacy selection can be turned off and still weights until then. Diet stays `prefs.diet` (`omnivore` / `vegetarian` / `vegan` / `pescatarian`), chosen on the What you eat step. New week / Modify prefer meals matching `prefs.tags` when that list is non-empty; otherwise they map saved onboarding **goals** (`decide`/`shop`/`waste`) to `quick` / `meal_prep`. A new account has `goals: []`, so that map adds nothing. `budget` goal does not steer to `low_calorie`. Vegetarian, vegan, and pescatarian filter New week and Modify; omnivore does not.

**Migration:** Users' saved `gym` pref was migrated to `high_protein`. Old `breakfast`, `lunch`, and `snack` tags were dropped.

Do not invent extra tag strings. See [NEWCOMING-MEALS.md](NEWCOMING-MEALS.md).
