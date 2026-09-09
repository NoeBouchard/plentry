-- Tesco shelf fallback for meal-catalog grocery keys.
-- Indicative own-brand prices (Sep 2026 estimates) so Tesco compares
-- when Pepesto live quotes are unavailable. SAFE TO RE-RUN.

insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('chicken-thighs', 'Chicken thigh fillets', 'protein', 'tesco', 'chicken thighs', 'Tesco British Chicken Thigh Fillets', '600g', 4.00, '£0.67 per 100g', true, '2026-09-05'),
  ('salmon-fillets', 'Salmon fillets', 'protein', 'tesco', 'salmon fillet', 'Tesco 2 Salmon Fillets', '260g', 4.50, '£1.73 per 100g', true, '2026-09-05'),
  ('beef-mince', 'Beef mince (5% fat)', 'protein', 'tesco', 'minced beef', 'Tesco 5% Fat Beef Mince', '500g', 3.95, '£0.79 per 100g', true, '2026-09-05'),
  ('halloumi', 'Halloumi', 'dairy', 'tesco', 'halloumi', 'Tesco Halloumi', '225g', 2.50, '£1.11 per 100g', true, '2026-09-05'),
  ('eggs', 'Eggs', 'protein', 'tesco', 'eggs', 'Tesco Free Range Medium Eggs', '6 pack', 1.55, '£0.26 each', true, '2026-09-05'),
  ('chickpeas', 'Chickpeas', 'pantry', 'tesco', 'chickpeas', 'Tesco Chickpeas in Water', '400g', 0.55, '£0.14 per 100g', true, '2026-09-05'),
  ('basmati-rice', 'Basmati rice', 'carbs', 'tesco', 'rice', 'Tesco Basmati Rice', '1kg', 1.45, '£0.15 per 100g', true, '2026-09-05'),
  ('spaghetti', 'Spaghetti', 'carbs', 'tesco', 'spaghetti', 'Tesco Spaghetti', '500g', 0.79, '£0.16 per 100g', true, '2026-09-05'),
  ('wraps', 'Wraps', 'carbs', 'tesco', 'tortillas', 'Tesco Plain Tortilla Wraps', '8 pack', 1.10, '£0.14 each', true, '2026-09-05'),
  ('coconut-milk', 'Coconut milk', 'pantry', 'tesco', 'coconut milk', 'Tesco Coconut Milk', '400ml', 0.89, '£0.22 per 100ml', true, '2026-09-05'),
  ('curry-paste', 'Tikka masala paste', 'pantry', 'tesco', 'curry paste', 'Tesco Tikka Masala Paste', '180g', 1.50, '£0.83 per 100g', true, '2026-09-05'),
  ('passata', 'Passata', 'pantry', 'tesco', 'passata', 'Tesco Passata', '500g', 0.55, '£0.11 per 100g', true, '2026-09-05'),
  ('onions', 'Onions', 'veg', 'tesco', 'onions', 'Tesco Brown Onions', '1kg', 0.85, '£0.09 per 100g', true, '2026-09-05'),
  ('garlic', 'Garlic', 'veg', 'tesco', 'garlic', 'Tesco Garlic', '3 pack', 0.65, '£0.22 each', true, '2026-09-05'),
  ('peppers', 'Peppers', 'veg', 'tesco', 'bell peppers', 'Tesco Mixed Peppers', '3 pack', 1.50, '£0.50 each', true, '2026-09-05'),
  ('broccoli', 'Broccoli', 'veg', 'tesco', 'broccoli', 'Tesco Broccoli', 'each', 0.79, '£0.79 each', true, '2026-09-05'),
  ('spinach', 'Spinach', 'veg', 'tesco', 'spinach', 'Tesco Baby Spinach', '200g', 1.20, '£0.60 per 100g', true, '2026-09-05'),
  ('tomatoes', 'Tomatoes', 'veg', 'tesco', 'tomatoes', 'Tesco Salad Tomatoes', '6 pack', 1.10, '£0.18 each', true, '2026-09-05'),
  ('lemon', 'Lemon', 'fruit', 'tesco', 'lemons', 'Tesco Lemons', '5 pack', 1.00, '£0.20 each', true, '2026-09-05'),
  ('potatoes', 'Potatoes', 'veg', 'tesco', 'potatoes', 'Tesco White Potatoes', '2kg', 1.25, '£0.06 per 100g', true, '2026-09-05'),
  ('olive-oil', 'Olive oil', 'pantry', 'tesco', 'olive oil', 'Tesco Olive Oil', '500ml', 3.50, '£0.70 per 100ml', true, '2026-09-05'),
  ('feta', 'Feta', 'dairy', 'tesco', 'feta', 'Tesco Greek Feta', '200g', 1.90, '£0.95 per 100g', true, '2026-09-05'),
  ('greek-yogurt', 'Greek yogurt', 'dairy', 'tesco', 'yoghurt', 'Tesco Greek Style Natural Yogurt', '500g', 1.15, '£0.23 per 100g', true, '2026-09-05'),
  ('parmesan', 'Parmesan', 'dairy', 'tesco', 'parmesan', 'Tesco Italian Parmigiano Reggiano', '170g', 3.00, '£1.76 per 100g', true, '2026-09-05'),
  ('chopped-tomatoes', 'Chopped tomatoes (tin)', 'pantry', 'tesco', 'chopped tomatoes', 'Tesco Chopped Tomatoes', '400g', 0.45, '£0.11 per 100g', true, '2026-09-08'),
  ('butter', 'Butter', 'dairy', 'tesco', 'butter', 'Tesco British Salted Butter', '250g', 1.89, '£0.76 per 100g', true, '2026-09-08'),
  ('fresh-coriander', 'Fresh coriander', 'veg', 'tesco', 'fresh coriander', 'Tesco Fresh Coriander', '30g', 0.60, '£2.00 per 100g', true, '2026-09-08')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category     = excluded.category,
  meal_key     = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size    = excluded.pack_size,
  price_gbp    = excluded.price_gbp,
  unit_price   = excluded.unit_price,
  is_estimate  = excluded.is_estimate,
  captured_on  = excluded.captured_on;
