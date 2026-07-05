-- Plentry — verified meals seed + catalog health checks.
-- SAFE TO RE-RUN: paste the whole file in the Supabase SQL Editor and Run.
--
-- Audit (5 Jul 2026): the 10 existing AI rows are all valid — every ingredient
-- is in the 24-item catalog, times are sane, no duplicates. Nothing to delete.
-- This file adds 40 hand-verified dishes (source='seed') so the base catalog is
-- trustworthy regardless of what the AI writes, then runs health checks.
--
-- Rules for a valid dish (also enforced by the ai edge fn):
--   * every `ing` entry is one of the 24 catalog ingredient keys
--   * 4–8 ingredients, cook time 15–45 min, unique name

-- ============ 1. SEED (idempotent; never overwrites existing rows) ============
insert into public.meals (name, emoji, time, ing, source, created_by) values
  ('Chicken & chickpea curry','🍛',30,'["chicken thighs","chickpeas","curry paste","coconut milk","onions","garlic","rice","spinach"]','seed',null),
  ('Salmon traybake','🐟',25,'["salmon fillet","potatoes","broccoli","lemons","olive oil","garlic"]','seed',null),
  ('Beef ragù spaghetti','🍝',35,'["minced beef","spaghetti","passata","onions","garlic","parmesan"]','seed',null),
  ('Halloumi fajitas','🌮',20,'["halloumi","tortillas","bell peppers","onions","yoghurt","lemons"]','seed',null),
  ('Shakshuka','🍳',25,'["eggs","passata","bell peppers","onions","garlic","feta"]','seed',null),
  ('Chickpea & spinach curry','🥘',20,'["chickpeas","curry paste","coconut milk","spinach","onions","rice","tomatoes"]','seed',null),
  ('Greek chicken bowls','🥗',30,'["chicken thighs","rice","tomatoes","feta","yoghurt","lemons","garlic"]','seed',null),
  ('Veggie spaghetti pomodoro','🍅',20,'["spaghetti","passata","tomatoes","garlic","olive oil","parmesan"]','seed',null),
  ('Lemon garlic roast chicken & potatoes','🍗',45,'["chicken thighs","potatoes","lemons","garlic","olive oil","broccoli"]','seed',null),
  ('Beef keema with rice','🍛',30,'["minced beef","curry paste","onions","garlic","tomatoes","rice","yoghurt"]','seed',null),
  ('Salmon & broccoli pasta','🐟',25,'["salmon fillet","spaghetti","broccoli","garlic","lemons","olive oil","parmesan"]','seed',null),
  ('Spanish tortilla with tomato salad','🥔',35,'["eggs","potatoes","onions","olive oil","tomatoes"]','seed',null),
  ('Halloumi & chickpea traybake','🧀',30,'["halloumi","chickpeas","bell peppers","onions","olive oil","lemons"]','seed',null),
  ('Chicken tikka-style wraps','🌯',25,'["chicken thighs","yoghurt","curry paste","tortillas","onions","tomatoes"]','seed',null),
  ('Egg fried rice with broccoli','🍚',20,'["eggs","rice","broccoli","onions","garlic","olive oil"]','seed',null),
  ('Beef & bell pepper tacos','🌮',25,'["minced beef","tortillas","bell peppers","onions","garlic","yoghurt"]','seed',null),
  ('Coconut salmon curry','🍛',30,'["salmon fillet","coconut milk","curry paste","spinach","onions","rice"]','seed',null),
  ('Baked feta pasta','🧀',30,'["spaghetti","feta","tomatoes","garlic","olive oil","spinach"]','seed',null),
  ('Chicken & broccoli rice bowls','🥡',30,'["chicken thighs","rice","broccoli","garlic","olive oil","lemons"]','seed',null),
  ('Spiced potato & spinach curry','🥔',30,'["potatoes","spinach","curry paste","coconut milk","onions","garlic","rice"]','seed',null),
  ('Beef meatballs in tomato sauce','🍝',35,'["minced beef","eggs","passata","garlic","spaghetti","parmesan"]','seed',null),
  ('Halloumi wraps with herby yoghurt','🌯',20,'["halloumi","tortillas","tomatoes","onions","yoghurt","spinach"]','seed',null),
  ('Chickpea shakshuka','🍳',25,'["chickpeas","eggs","passata","onions","bell peppers","garlic"]','seed',null),
  ('Lemon chicken & parmesan rice','🍋',35,'["chicken thighs","rice","lemons","garlic","spinach","parmesan"]','seed',null),
  ('Crispy salmon & smashed potatoes','🐟',35,'["salmon fillet","potatoes","olive oil","lemons","broccoli","yoghurt"]','seed',null),
  ('Beef stuffed peppers','🫑',40,'["bell peppers","minced beef","rice","passata","onions","parmesan"]','seed',null),
  ('Chicken saag-style curry','🍛',35,'["chicken thighs","spinach","curry paste","yoghurt","onions","garlic","rice"]','seed',null),
  ('Greek-style chickpea salad bowls','🥗',15,'["chickpeas","tomatoes","feta","olive oil","lemons","spinach"]','seed',null),
  ('Spinach & feta omelette with potatoes','🍳',20,'["eggs","spinach","feta","potatoes","olive oil"]','seed',null),
  ('Tomato & parmesan baked rice','🍚',35,'["rice","passata","onions","garlic","parmesan","olive oil"]','seed',null),
  ('Curried beef & potato traybake','🥘',40,'["minced beef","potatoes","curry paste","onions","tomatoes","yoghurt"]','seed',null),
  ('Halloumi & broccoli grain bowls','🥦',25,'["halloumi","rice","broccoli","lemons","olive oil","garlic"]','seed',null),
  ('Chicken fajita rice','🍚',30,'["chicken thighs","rice","bell peppers","onions","garlic","tomatoes"]','seed',null),
  ('Salmon tacos with lemon yoghurt','🌮',20,'["salmon fillet","tortillas","yoghurt","lemons","spinach","onions"]','seed',null),
  ('Spaghetti aglio e olio with spinach','🍝',15,'["spaghetti","garlic","olive oil","spinach","parmesan"]','seed',null),
  ('Chickpea & potato coconut stew','🥘',30,'["chickpeas","potatoes","coconut milk","curry paste","onions","spinach"]','seed',null),
  ('Beef & broccoli fried rice','🥡',25,'["minced beef","broccoli","rice","garlic","onions","olive oil"]','seed',null),
  ('Feta & pepper egg wraps','🌯',15,'["eggs","feta","bell peppers","tortillas","spinach"]','seed',null),
  ('Chicken parm-style bake','🍗',40,'["chicken thighs","passata","parmesan","spaghetti","garlic","olive oil"]','seed',null),
  ('Tandoori-style yoghurt chicken with rice','🍗',35,'["chicken thighs","yoghurt","curry paste","lemons","rice","onions"]','seed',null)
on conflict (name) do nothing;

-- ============ 2. HEALTH CHECKS (run after seeding; all should return 0 rows) ==

-- 2a. Dishes with ingredients outside the 24-item catalog (should be EMPTY):
select m.id, m.name, bad.ing as invalid_ingredient
from public.meals m,
     lateral jsonb_array_elements_text(m.ing) as bad(ing)
where bad.ing not in (
  'chicken thighs','salmon fillet','minced beef','halloumi','eggs','chickpeas',
  'rice','spaghetti','tortillas','coconut milk','curry paste','passata',
  'onions','garlic','bell peppers','broccoli','spinach','tomatoes',
  'lemons','potatoes','olive oil','feta','yoghurt','parmesan');

-- 2b. Dishes with silly times or ingredient counts (should be EMPTY):
select id, name, time, jsonb_array_length(ing) as n_ing
from public.meals
where time not between 10 and 60
   or jsonb_array_length(ing) not between 3 and 9;

-- 2c. Near-duplicate names — same first 12 chars, case-insensitive (review manually):
select lower(left(name,12)) as stem, count(*), array_agg(name)
from public.meals
group by 1 having count(*) > 1;

-- 2d. Catalog size by source:
select source, count(*) from public.meals group by source order by 2 desc;
