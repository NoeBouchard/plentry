# Meal tags

Closed set. A meal can have **several**. Same list in `plentry/index.html` (`MEAL_TAGS`), `plentry/supabase/functions/ai/index.ts`, and `meals.tags` (jsonb, constrained).

## Diet / preference (exactly one)

- `vegetarian`
- `vegan`
- `meat`
- `fish`

Vegan is not also tagged vegetarian. Client “veggie” matching should treat vegetarian **or** vegan as a hit. New week / Modify default to **omnivore** (prefer `meat`/`fish`, cap vegetarian/vegan) until `prefs.diet` is set.

## Nutrition / goal

- `low_calorie`
- `high_protein`
- `low_carb`

## Meal context

- `breakfast`
- `lunch`
- `dinner` (always on catalog dinners)
- `snack`

## Use case

- `gym`
- `meal_prep`
- `quick` (cook time ≤ 20 min)
- `comfort_food`

## Live catalog (9 Sep 2026)

77 dinners, all reviewed: **33 meat**, **11 fish**, **28 vegetarian**, **5 vegan**.

## How they get set

- **Current 77:** inferred from name + `ing` (`meal_tags_for` / `tagsFor`), then `reviewed_at` set (catalog review 8 Sep 2026).
- **Advisor / AI inserts:** the model must return `tags`; the `ai` function **whitelists** and fills from ingredients so a row is never stored without tags. `reviewed_at` stays null (**New meal**) until the founder verifies it on the Meals tab.

## User prefs (`prefs.tags`)

Onboarding step 2 and Profile → Dinner tags store a subset of the use-case/nutrition tags (`quick`, `meal_prep`, `gym`, `high_protein`, `low_calorie`, `low_carb`, `comfort_food`). Diet stays `prefs.diet`. New week / Modify prefer meals matching `prefs.tags` when that list is non-empty; otherwise they still map onboarding **goals** (decide/shop/waste/budget) to quick / meal_prep / low_calorie.

Do not invent extra tag strings. See [NEWCOMING-MEALS.md](NEWCOMING-MEALS.md).
