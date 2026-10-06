-- Servings (I-P01–I-P05). Safe to re-run. Does not change prices or the 5% fee.
-- meals.portions is the verified 2-serving amount per catalog key, written by
-- the meal-verification SQL patch. ingredient_prices.pack_qty / pack_unit let a
-- store's real pack override the catalog default later. The app ships on the
-- catalog default until a row sets these.

alter table public.meals add column if not exists portions jsonb;

alter table public.ingredient_prices add column if not exists pack_qty numeric;
alter table public.ingredient_prices add column if not exists pack_unit text;

-- Fill only empty cells so a later real pack is not overwritten.
update public.ingredient_prices as p
set pack_qty = v.qty, pack_unit = v.unit
from (values
  ('chicken thighs', 4::numeric, 'pc'),
  ('salmon fillet', 2, 'pc'),
  ('minced beef', 500, 'g'),
  ('halloumi', 225, 'g'),
  ('eggs', 6, 'pc'),
  ('chickpeas', 400, 'g'),
  ('rice', 1000, 'g'),
  ('spaghetti', 500, 'g'),
  ('tortillas', 8, 'pc'),
  ('coconut milk', 400, 'ml'),
  ('curry paste', 12, 'tbsp'),
  ('passata', 500, 'g'),
  ('onions', 3, 'pc'),
  ('garlic', 10, 'clove'),
  ('bell peppers', 3, 'pc'),
  ('broccoli', 1, 'pc'),
  ('spinach', 240, 'g'),
  ('tomatoes', 6, 'pc'),
  ('lemons', 3, 'pc'),
  ('potatoes', 1000, 'g'),
  ('olive oil', 33, 'tbsp'),
  ('feta', 200, 'g'),
  ('yoghurt', 500, 'g'),
  ('parmesan', 80, 'g'),
  ('chopped tomatoes', 400, 'g'),
  ('butter', 250, 'g'),
  ('fresh coriander', 30, 'g')
) as v(meal_key, qty, unit)
where p.meal_key = v.meal_key and p.pack_qty is null;
