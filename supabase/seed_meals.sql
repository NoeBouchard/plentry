-- Plentry — verified meals seed + catalog health checks.
-- SAFE TO RE-RUN: paste the whole file in the Supabase SQL Editor and Run.
--
-- Audit (5 Jul 2026): the 10 existing AI rows are all valid. Nothing to delete.
-- This file adds 40 hand-verified dishes (source='seed') so the base catalog is
-- trustworthy regardless of what the AI writes, then runs health checks.
--
-- Rules for a valid dish (also enforced by the ai edge fn):
--   * every `ing` entry is a catalog key (27 groceries + cupboard seasonings)
--   * 4–16 ingredients, cook time 15–50 min, unique name
-- Photos: run meals_images.sql after this file (adds image_url + backfill).
-- Methods: run catalog_review_2026_09_08.sql to write `recipe` JSON on every row.

alter table public.meals add column if not exists image_url text;

-- ============ 1. SEED (idempotent; never overwrites existing rows) ============
insert into public.meals (name, emoji, time, ing, source, created_by) values
  ('Baked feta pasta','🧀',30,'["black pepper", "feta", "garlic", "mixed herbs", "olive oil", "salt", "spaghetti", "spinach", "tomatoes"]','seed',null),
  ('Beef & bell pepper tacos','🌮',25,'["bell peppers", "black pepper", "chilli flakes", "cumin", "fresh coriander", "garlic", "lemons", "minced beef", "olive oil", "onions", "paprika", "salt", "tortillas", "yoghurt"]','seed',null),
  ('Beef & broccoli fried rice','🥡',25,'["black pepper", "broccoli", "eggs", "garlic", "minced beef", "olive oil", "onions", "rice", "salt", "soy sauce"]','seed',null),
  ('Beef keema with rice','🍛',30,'["black pepper", "chilli flakes", "chopped tomatoes", "cumin", "curry paste", "fresh coriander", "garlic", "minced beef", "olive oil", "onions", "paprika", "rice", "salt", "stock cubes", "yoghurt"]','seed',null),
  ('Beef meatballs in tomato sauce','🍝',35,'["black pepper", "eggs", "garlic", "minced beef", "mixed herbs", "olive oil", "onions", "parmesan", "passata", "salt", "spaghetti"]','seed',null),
  ('Beef ragù spaghetti','🍝',35,'["black pepper", "garlic", "minced beef", "mixed herbs", "olive oil", "onions", "parmesan", "passata", "salt", "spaghetti"]','seed',null),
  ('Beef stuffed peppers','🫑',40,'["bell peppers", "black pepper", "garlic", "minced beef", "mixed herbs", "olive oil", "onions", "parmesan", "passata", "rice", "salt"]','seed',null),
  ('Chicken & broccoli rice bowls','🥡',30,'["black pepper", "broccoli", "chicken thighs", "garlic", "lemons", "olive oil", "paprika", "rice", "salt", "soy sauce"]','seed',null),
  ('Chicken & chickpea curry','🍛',30,'["black pepper", "chicken thighs", "chickpeas", "chilli flakes", "coconut milk", "cumin", "curry paste", "fresh coriander", "garlic", "olive oil", "onions", "paprika", "rice", "salt", "spinach", "stock cubes"]','seed',null),
  ('Chicken fajita rice','🍚',30,'["bell peppers", "black pepper", "chicken thighs", "chilli flakes", "cumin", "garlic", "olive oil", "onions", "paprika", "rice", "salt", "stock cubes", "tomatoes"]','seed',null),
  ('Chicken parm-style bake','🍗',40,'["black pepper", "chicken thighs", "garlic", "mixed herbs", "olive oil", "parmesan", "passata", "salt", "spaghetti"]','seed',null),
  ('Chicken saag-style curry','🍛',35,'["black pepper", "chicken thighs", "chilli flakes", "cumin", "curry paste", "garlic", "olive oil", "onions", "paprika", "rice", "salt", "spinach", "stock cubes", "yoghurt"]','seed',null),
  ('Chicken tikka-style wraps','🌯',25,'["black pepper", "chicken thighs", "chilli flakes", "cumin", "curry paste", "fresh coriander", "garlic", "lemons", "olive oil", "onions", "paprika", "salt", "tomatoes", "tortillas", "yoghurt"]','seed',null),
  ('Chickpea & potato coconut stew','🥘',30,'["black pepper", "chickpeas", "chilli flakes", "coconut milk", "cumin", "curry paste", "garlic", "olive oil", "onions", "paprika", "potatoes", "salt", "spinach", "stock cubes"]','seed',null),
  ('Chickpea & spinach curry','🥘',25,'["black pepper", "chickpeas", "chilli flakes", "chopped tomatoes", "coconut milk", "cumin", "curry paste", "fresh coriander", "garlic", "olive oil", "onions", "paprika", "rice", "salt", "spinach", "stock cubes"]','seed',null),
  ('Chickpea shakshuka','🍳',25,'["bell peppers", "black pepper", "chickpeas", "cumin", "eggs", "garlic", "mixed herbs", "olive oil", "onions", "paprika", "passata", "salt", "tortillas"]','seed',null),
  ('Coconut salmon curry','🍛',30,'["black pepper", "chilli flakes", "coconut milk", "cumin", "curry paste", "fresh coriander", "garlic", "lemons", "olive oil", "onions", "paprika", "rice", "salmon fillet", "salt", "spinach", "stock cubes"]','seed',null),
  ('Crispy salmon & smashed potatoes','🐟',35,'["black pepper", "broccoli", "butter", "lemons", "olive oil", "paprika", "potatoes", "salmon fillet", "salt", "yoghurt"]','seed',null),
  ('Curried beef & potato traybake','🥘',40,'["black pepper", "chilli flakes", "chopped tomatoes", "cumin", "curry paste", "minced beef", "olive oil", "onions", "paprika", "potatoes", "salt", "stock cubes", "yoghurt"]','seed',null),
  ('Egg fried rice with broccoli','🍚',20,'["black pepper", "broccoli", "eggs", "garlic", "olive oil", "onions", "rice", "salt", "soy sauce"]','seed',null),
  ('Feta & pepper egg wraps','🌯',15,'["bell peppers", "black pepper", "eggs", "feta", "olive oil", "paprika", "salt", "spinach", "tortillas"]','seed',null),
  ('Greek chicken bowls','🥗',30,'["black pepper", "chicken thighs", "feta", "garlic", "lemons", "mixed herbs", "olive oil", "rice", "salt", "tomatoes", "yoghurt"]','seed',null),
  ('Greek-style chickpea salad bowls','🥗',15,'["black pepper", "chickpeas", "feta", "lemons", "mixed herbs", "olive oil", "onions", "salt", "spinach", "tomatoes"]','seed',null),
  ('Halloumi & broccoli grain bowls','🥦',25,'["black pepper", "broccoli", "garlic", "halloumi", "lemons", "olive oil", "paprika", "rice", "salt"]','seed',null),
  ('Halloumi & chickpea traybake','🧀',30,'["bell peppers", "black pepper", "chickpeas", "halloumi", "lemons", "olive oil", "onions", "paprika", "salt"]','seed',null),
  ('Halloumi fajitas','🌮',20,'["bell peppers", "black pepper", "chilli flakes", "cumin", "fresh coriander", "halloumi", "lemons", "olive oil", "onions", "paprika", "salt", "tortillas", "yoghurt"]','seed',null),
  ('Halloumi wraps with herby yoghurt','🌯',20,'["black pepper", "halloumi", "lemons", "mixed herbs", "olive oil", "onions", "salt", "spinach", "tomatoes", "tortillas", "yoghurt"]','seed',null),
  ('Lemon chicken & parmesan rice','🍋',35,'["black pepper", "butter", "chicken thighs", "garlic", "lemons", "mixed herbs", "olive oil", "parmesan", "rice", "salt", "spinach"]','seed',null),
  ('Lemon garlic roast chicken & potatoes','🍗',45,'["black pepper", "broccoli", "chicken thighs", "garlic", "lemons", "olive oil", "paprika", "potatoes", "salt"]','seed',null),
  ('Salmon & broccoli pasta','🐟',25,'["black pepper", "broccoli", "garlic", "lemons", "mixed herbs", "olive oil", "parmesan", "salmon fillet", "salt", "spaghetti"]','seed',null),
  ('Salmon tacos with lemon yoghurt','🌮',20,'["black pepper", "chilli flakes", "cumin", "fresh coriander", "lemons", "olive oil", "onions", "paprika", "salmon fillet", "salt", "spinach", "tortillas", "yoghurt"]','seed',null),
  ('Salmon traybake','🐟',30,'["black pepper", "broccoli", "garlic", "lemons", "olive oil", "paprika", "potatoes", "salmon fillet", "salt"]','seed',null),
  ('Shakshuka','🍳',25,'["bell peppers", "black pepper", "cumin", "eggs", "feta", "garlic", "mixed herbs", "olive oil", "onions", "paprika", "passata", "salt", "tortillas"]','seed',null),
  ('Spaghetti aglio e olio with spinach','🍝',15,'["black pepper", "chilli flakes", "garlic", "olive oil", "parmesan", "salt", "spaghetti", "spinach"]','seed',null),
  ('Spanish tortilla with tomato salad','🥔',35,'["black pepper", "eggs", "olive oil", "onions", "paprika", "potatoes", "salt", "tomatoes"]','seed',null),
  ('Spiced potato & spinach curry','🥔',30,'["black pepper", "chilli flakes", "coconut milk", "cumin", "curry paste", "garlic", "olive oil", "onions", "paprika", "potatoes", "rice", "salt", "spinach", "stock cubes"]','seed',null),
  ('Spinach & feta omelette with potatoes','🍳',20,'["black pepper", "eggs", "feta", "olive oil", "paprika", "potatoes", "salt", "spinach"]','seed',null),
  ('Tandoori-style yoghurt chicken with rice','🍗',35,'["black pepper", "chicken thighs", "chilli flakes", "cumin", "curry paste", "garlic", "lemons", "olive oil", "onions", "paprika", "rice", "salt", "stock cubes", "yoghurt"]','seed',null),
  ('Tomato & parmesan baked rice','🍚',35,'["black pepper", "garlic", "mixed herbs", "olive oil", "onions", "parmesan", "passata", "rice", "salt", "stock cubes"]','seed',null),
  ('Veggie spaghetti pomodoro','🍅',20,'["black pepper", "garlic", "mixed herbs", "olive oil", "parmesan", "passata", "salt", "spaghetti", "tomatoes"]','seed',null)
on conflict (name) do nothing;

-- ============ 2. HEALTH CHECKS (run after seeding; all should return 0 rows) ==

-- 2a. Dishes with ingredients outside the catalog (should be EMPTY):
select m.id, m.name, bad.ing as invalid_ingredient
from public.meals m,
     lateral jsonb_array_elements_text(m.ing) as bad(ing)
where bad.ing not in (
  'chicken thighs','salmon fillet','minced beef','halloumi','eggs','chickpeas',
  'rice','spaghetti','tortillas','coconut milk','curry paste','passata',
  'onions','garlic','bell peppers','broccoli','spinach','tomatoes',
  'lemons','potatoes','olive oil','feta','yoghurt','parmesan',
  'chopped tomatoes','butter','fresh coriander',
  'salt','black pepper','paprika','cumin','chilli flakes','mixed herbs','soy sauce','stock cubes');

-- 2b. Dishes with silly times or ingredient counts (should be EMPTY):
select id, name, time, jsonb_array_length(ing) as n_ing
from public.meals
where time not between 10 and 60
   or jsonb_array_length(ing) not between 4 and 20;

-- 2c. Near-duplicate names — same first 12 chars, case-insensitive (review manually):
select lower(left(name,12)) as stem, count(*), array_agg(name)
from public.meals
group by 1 having count(*) > 1;

-- 2d. Catalog size by source:
select source, count(*) from public.meals group by source order by 2 desc;
