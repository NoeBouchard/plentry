-- Plentry: meal categories + tag restructure + new ingredient keys
-- 2026-10-06. SAFE TO RE-RUN.
--
-- Changes:
-- 1. Add meals.category column (7 values: pasta, rice_bowl, tacos_wraps, curry_stew, oven_bake, eggs, salad)
-- 2. Remove gym, breakfast, lunch, snack tags; migrate user prefs (gym → high_protein)
-- 3. Change quick threshold from ≤20 to <30 minutes
-- 4. Vegan dishes now carry BOTH vegan AND vegetarian tags
-- 5. Tags become stored; only diet, quick, dinner are DB-derived
-- 6. Add 11 new ingredient keys with prices
--
-- Per tag-category-proposal.md Decisions section (6 Oct 2026, Noé approval).

begin;

-- ============================================================================
-- 1. Add category column
-- ============================================================================

alter table public.meals add column if not exists category text;

-- ============================================================================
-- 2. Update constraints BEFORE backfill (avoids CHECK failure on vegan+vegetarian)
-- ============================================================================

-- Category constraint: null only for unverified meals, else one of the 7
alter table public.meals drop constraint if exists meals_category_check;
alter table public.meals add constraint meals_category_check check (
  (category is null and reviewed_at is null)
  or (category is not null and category in ('pasta', 'rice_bowl', 'tacos_wraps', 'curry_stew', 'oven_bake', 'eggs', 'salad'))
);

-- Tags constraint: updated list (11 tags total, removed gym/breakfast/lunch/snack)
-- Exactly one of meat/fish/vegetarian; vegan implies vegetarian
alter table public.meals drop constraint if exists meals_tags_shape;
alter table public.meals add constraint meals_tags_shape check (
  tags is not null
  and jsonb_typeof(tags) = 'array'
  and jsonb_array_length(tags) between 1 and 9
  and tags <@ '[
    "vegetarian","vegan","meat","fish",
    "low_calorie","high_protein","low_carb",
    "dinner","meal_prep","quick","comfort_food"
  ]'::jsonb
  and (tags ? 'dinner')
  and (
    (tags ? 'meat')::int + (tags ? 'fish')::int + (tags ? 'vegetarian')::int
  ) = 1
  and (not (tags ? 'vegan') or (tags ? 'vegetarian'))
);

comment on constraint meals_tags_shape on public.meals is 
  'Tags: 11-tag closed set. Exactly one of meat/fish/vegetarian. Vegan dishes also carry vegetarian.';

-- ============================================================================
-- 3. Update meal_tags_for function: now only derives diet, quick, dinner
-- ============================================================================

create or replace function public.meal_tags_for(p_name text, p_ing jsonb, p_time int)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  t int := coalesce(p_time, 25);
  tags text[] := '{}';
  has_meat boolean;
  has_fish boolean;
  has_animal boolean;
  is_vegan boolean;
begin
  -- Diet tags from ingredients
  has_meat := p_ing ?| array['chicken thighs', 'minced beef'];
  has_fish := p_ing ? 'salmon fillet';
  has_animal := p_ing ?| array[
    'chicken thighs', 'minced beef', 'salmon fillet', 'eggs', 
    'feta', 'halloumi', 'yoghurt', 'parmesan', 'butter', 'cheddar'
  ];
  
  if has_meat then
    tags := array_append(tags, 'meat');
  elsif has_fish then
    tags := array_append(tags, 'fish');
  elsif not has_animal then
    -- Vegan dishes carry BOTH vegan and vegetarian
    tags := array_append(tags, 'vegan');
    tags := array_append(tags, 'vegetarian');
  else
    tags := array_append(tags, 'vegetarian');
  end if;

  -- Always add dinner
  tags := array_append(tags, 'dinner');
  
  -- Quick if time < 30 minutes (changed from ≤20)
  if t < 30 then 
    tags := array_append(tags, 'quick');
  end if;

  return to_jsonb(tags);
end;
$$;

comment on function public.meal_tags_for(text, jsonb, integer) is
  'Derives only diet (with vegan+vegetarian for vegan dishes), dinner, and quick (<30min). Other tags are curated.';

-- ============================================================================
-- 4. Create trigger to maintain derived tags on insert/update
-- ============================================================================

create or replace function public.meals_tags_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived jsonb;
  derived_tags text[];
  current_tags text[];
  final_tags text[];
  t text;
begin
  -- Compute what the DB should derive
  derived := public.meal_tags_for(new.name, new.ing, new.time);
  derived_tags := array(select jsonb_array_elements_text(derived));
  
  -- Current tags on the row
  current_tags := array(select jsonb_array_elements_text(new.tags));
  
  -- Start with derived tags
  final_tags := derived_tags;
  
  -- Add any curated tags from current that aren't diet/dinner/quick
  foreach t in array current_tags loop
    if t not in ('meat', 'fish', 'vegetarian', 'vegan', 'dinner', 'quick') 
       and not (t = any(final_tags)) then
      final_tags := array_append(final_tags, t);
    end if;
  end loop;
  
  new.tags := to_jsonb(final_tags);
  return new;
end;
$$;

drop trigger if exists meals_tags_derive on public.meals;
create trigger meals_tags_derive
  before insert or update of ing, time, tags
  on public.meals
  for each row
  execute function public.meals_tags_derive();

comment on trigger meals_tags_derive on public.meals is
  'Maintains diet, dinner, quick tags; preserves curated tags (meal_prep, comfort_food, high_protein, low_carb, low_calorie).';

-- ============================================================================
-- 5. Backfill categories on all 77 meals
-- ============================================================================

-- PASTA (16 meals)
update public.meals set category = 'pasta' where name = 'Baked feta pasta';
update public.meals set category = 'pasta' where name = 'Beef & Broccoli Spaghetti with Garlic Oil';
update public.meals set category = 'pasta' where name = 'Beef meatballs in tomato sauce';
update public.meals set category = 'pasta' where name = 'Beef ragù spaghetti';
update public.meals set category = 'pasta' where name = 'Chicken & Bell Pepper Pasta Bake';
update public.meals set category = 'pasta' where name = 'Chicken parm-style bake';
update public.meals set category = 'pasta' where name = 'Chickpea & Tomato Coconut Pasta';
update public.meals set category = 'pasta' where name = 'Creamy Chickpea & Tomato Pasta';
update public.meals set category = 'pasta' where name = 'Crispy Halloumi & Tomato Spaghetti';
update public.meals set category = 'pasta' where name = 'Garlic Tomato Chicken Thigh Spaghetti';
update public.meals set category = 'pasta' where name = 'Garlic Tomato Halloumi Spaghetti';
update public.meals set category = 'pasta' where name = 'Minced Beef & Chickpea Bolognese';
update public.meals set category = 'pasta' where name = 'Salmon & broccoli pasta';
update public.meals set category = 'pasta' where name = 'Salmon & Tomato Coconut Pasta';
update public.meals set category = 'pasta' where name = 'Spaghetti aglio e olio with spinach';
update public.meals set category = 'pasta' where name = 'Veggie spaghetti pomodoro';

-- RICE_BOWL (15 meals)
update public.meals set category = 'rice_bowl' where name = 'Beef & broccoli fried rice';
update public.meals set category = 'rice_bowl' where name = 'Beef Meatballs with Lemon Herb Yoghurt';
update public.meals set category = 'rice_bowl' where name = 'Chicken & broccoli rice bowls';
update public.meals set category = 'rice_bowl' where name = 'Chicken fajita rice';
update public.meals set category = 'rice_bowl' where name = 'Egg fried rice with broccoli';
update public.meals set category = 'rice_bowl' where name = 'Greek chicken bowls';
update public.meals set category = 'rice_bowl' where name = 'Halloumi & broccoli grain bowls';
update public.meals set category = 'rice_bowl' where name = 'Lemon chicken & parmesan rice';
update public.meals set category = 'rice_bowl' where name = 'Minced Beef & Bell Pepper Coconut Rice';
update public.meals set category = 'rice_bowl' where name = 'Minced Beef & Chickpea Rice Bowl';
update public.meals set category = 'rice_bowl' where name = 'Salmon & Lemon Risotto with Parmesan';
update public.meals set category = 'rice_bowl' where name = 'Salmon & Spinach Rice with Lemon';
update public.meals set category = 'rice_bowl' where name = 'Spiced Halloumi Rice Bowl with Tomato & Spinach';
update public.meals set category = 'rice_bowl' where name = 'Spiced Minced Beef & Bell Pepper Rice';
update public.meals set category = 'rice_bowl' where name = 'Tomato & parmesan baked rice';

-- OVEN_BAKE (15 meals)
update public.meals set category = 'oven_bake' where name = 'Baked Potatoes with Feta & Spinach Topping';
update public.meals set category = 'oven_bake' where name = 'Baked Salmon with Roasted Broccoli & Lemon';
update public.meals set category = 'oven_bake' where name = 'Beef & Parmesan Mash with Sautéed Spinach';
update public.meals set category = 'oven_bake' where name = 'Beef & Tomato Tortilla Casserole';
update public.meals set category = 'oven_bake' where name = 'Beef stuffed peppers';
update public.meals set category = 'oven_bake' where name = 'Creamy Spinach & Feta Baked Potatoes';
update public.meals set category = 'oven_bake' where name = 'Crispy salmon & smashed potatoes';
update public.meals set category = 'oven_bake' where name = 'Curried beef & potato traybake';
update public.meals set category = 'oven_bake' where name = 'Curried Chicken Thigh & Potato Traybake with Coconut';
update public.meals set category = 'oven_bake' where name = 'Curried Salmon with Roasted Potatoes & Broccoli';
update public.meals set category = 'oven_bake' where name = 'Halloumi & chickpea traybake';
update public.meals set category = 'oven_bake' where name = 'Halloumi & Potato Skewers with Tomato Sauce';
update public.meals set category = 'oven_bake' where name = 'Lemon garlic roast chicken & potatoes';
update public.meals set category = 'oven_bake' where name = 'Salmon traybake';
update public.meals set category = 'oven_bake' where name = 'Tandoori-style yoghurt chicken with rice';

-- TACOS_WRAPS (12 meals)
update public.meals set category = 'tacos_wraps' where name = 'Beef & bell pepper tacos';
update public.meals set category = 'tacos_wraps' where name = 'Beef & Potato Curry Tacos';
update public.meals set category = 'tacos_wraps' where name = 'Beef Meatballs with Yoghurt & Herbs';
update public.meals set category = 'tacos_wraps' where name = 'Chicken Thigh Fajita Tortillas';
update public.meals set category = 'tacos_wraps' where name = 'Chicken tikka-style wraps';
update public.meals set category = 'tacos_wraps' where name = 'Crispy Chicken Thigh Tortilla Stack with Tomato & Feta';
update public.meals set category = 'tacos_wraps' where name = 'Crispy Halloumi & Broccoli Tortilla Wraps';
update public.meals set category = 'tacos_wraps' where name = 'Feta & pepper egg wraps';
update public.meals set category = 'tacos_wraps' where name = 'Halloumi fajitas';
update public.meals set category = 'tacos_wraps' where name = 'Halloumi wraps with herby yoghurt';
update public.meals set category = 'tacos_wraps' where name = 'Salmon tacos with lemon yoghurt';
update public.meals set category = 'tacos_wraps' where name = 'Spinach & Feta Egg Tortilla Wraps';

-- CURRY_STEW (9 meals)
update public.meals set category = 'curry_stew' where name = 'Beef keema with rice';
update public.meals set category = 'curry_stew' where name = 'Chicken & chickpea curry';
update public.meals set category = 'curry_stew' where name = 'Chicken saag-style curry';
update public.meals set category = 'curry_stew' where name = 'Chickpea & potato coconut stew';
update public.meals set category = 'curry_stew' where name = 'Chickpea & spinach curry';
update public.meals set category = 'curry_stew' where name = 'Coconut salmon curry';
update public.meals set category = 'curry_stew' where name = 'Curried Chickpea & Tomato Coconut Soup';
update public.meals set category = 'curry_stew' where name = 'Minced Beef & Potato Coconut Stew';
update public.meals set category = 'curry_stew' where name = 'Spiced potato & spinach curry';

-- EGGS (7 meals)
update public.meals set category = 'eggs' where name = 'Baked Eggs in Tomato & Chickpea Sauce with Spinach';
update public.meals set category = 'eggs' where name = 'Baked Eggs with Chickpea Tomato Sauce';
update public.meals set category = 'eggs' where name = 'Chickpea shakshuka';
update public.meals set category = 'eggs' where name = 'Salmon & Potato Frittata';
update public.meals set category = 'eggs' where name = 'Shakshuka';
update public.meals set category = 'eggs' where name = 'Spanish tortilla with tomato salad';
update public.meals set category = 'eggs' where name = 'Spinach & feta omelette with potatoes';

-- SALAD (3 meals)
update public.meals set category = 'salad' where name = 'Greek-style chickpea salad bowls';
update public.meals set category = 'salad' where name = 'Halloumi & Chickpea Buddha Bowl with Yoghurt Dressing';
update public.meals set category = 'salad' where name = 'Pan-Seared Halloumi with Lemon Broccoli & Chickpea Salad';

-- ============================================================================
-- 6. Remove old tags and set curated tags on all 77 meals
-- ============================================================================

-- First, strip gym, breakfast, lunch, snack from all meals
update public.meals set tags = tags - 'gym' - 'breakfast' - 'lunch' - 'snack';

-- Now set curated tags (meal_prep, comfort_food, high_protein, low_carb, low_calorie)
-- per Appendix B "Proposed tags" column (excluding diet and dinner which are derived)

-- PASTA
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'comfort_food') where name = 'Baked feta pasta';
update public.meals set tags = jsonb_build_array('meat', 'dinner') where name = 'Beef & Broccoli Spaghetti with Garlic Oil';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep', 'comfort_food', 'high_protein') where name = 'Beef meatballs in tomato sauce';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep', 'comfort_food', 'high_protein') where name = 'Beef ragù spaghetti';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep', 'comfort_food', 'high_protein') where name = 'Chicken & Bell Pepper Pasta Bake';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'comfort_food', 'high_protein') where name = 'Chicken parm-style bake';
update public.meals set tags = jsonb_build_array('vegan', 'vegetarian', 'dinner') where name = 'Chickpea & Tomato Coconut Pasta';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Creamy Chickpea & Tomato Pasta';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Crispy Halloumi & Tomato Spaghetti';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein') where name = 'Garlic Tomato Chicken Thigh Spaghetti';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Garlic Tomato Halloumi Spaghetti';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep', 'high_protein') where name = 'Minced Beef & Chickpea Bolognese';
update public.meals set tags = jsonb_build_array('fish', 'dinner', 'high_protein') where name = 'Salmon & broccoli pasta';
update public.meals set tags = jsonb_build_array('fish', 'dinner') where name = 'Salmon & Tomato Coconut Pasta';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Spaghetti aglio e olio with spinach';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Veggie spaghetti pomodoro';

-- RICE_BOWL
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'comfort_food', 'high_protein', 'quick') where name = 'Beef & broccoli fried rice';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein') where name = 'Beef Meatballs with Lemon Herb Yoghurt';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein', 'quick') where name = 'Chicken & broccoli rice bowls';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein', 'quick') where name = 'Chicken fajita rice';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Egg fried rice with broccoli';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein', 'quick') where name = 'Greek chicken bowls';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Halloumi & broccoli grain bowls';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein') where name = 'Lemon chicken & parmesan rice';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'quick') where name = 'Minced Beef & Bell Pepper Coconut Rice';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein', 'quick') where name = 'Minced Beef & Chickpea Rice Bowl';
update public.meals set tags = jsonb_build_array('fish', 'dinner', 'comfort_food') where name = 'Salmon & Lemon Risotto with Parmesan';
update public.meals set tags = jsonb_build_array('fish', 'dinner') where name = 'Salmon & Spinach Rice with Lemon';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner') where name = 'Spiced Halloumi Rice Bowl with Tomato & Spinach';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein', 'quick') where name = 'Spiced Minced Beef & Bell Pepper Rice';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner') where name = 'Tomato & parmesan baked rice';

-- OVEN_BAKE
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'low_calorie') where name = 'Baked Potatoes with Feta & Spinach Topping';
update public.meals set tags = jsonb_build_array('fish', 'dinner') where name = 'Baked Salmon with Roasted Broccoli & Lemon';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'comfort_food', 'high_protein') where name = 'Beef & Parmesan Mash with Sautéed Spinach';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep', 'comfort_food', 'high_protein') where name = 'Beef & Tomato Tortilla Casserole';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep', 'high_protein') where name = 'Beef stuffed peppers';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'low_calorie') where name = 'Creamy Spinach & Feta Baked Potatoes';
update public.meals set tags = jsonb_build_array('fish', 'dinner', 'high_protein', 'quick') where name = 'Crispy salmon & smashed potatoes';
update public.meals set tags = jsonb_build_array('meat', 'dinner') where name = 'Curried beef & potato traybake';
update public.meals set tags = jsonb_build_array('meat', 'dinner') where name = 'Curried Chicken Thigh & Potato Traybake with Coconut';
update public.meals set tags = jsonb_build_array('fish', 'dinner') where name = 'Curried Salmon with Roasted Potatoes & Broccoli';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'meal_prep') where name = 'Halloumi & chickpea traybake';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner') where name = 'Halloumi & Potato Skewers with Tomato Sauce';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'comfort_food', 'high_protein') where name = 'Lemon garlic roast chicken & potatoes';
update public.meals set tags = jsonb_build_array('fish', 'dinner', 'high_protein') where name = 'Salmon traybake';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein') where name = 'Tandoori-style yoghurt chicken with rice';

-- TACOS_WRAPS
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'quick') where name = 'Beef & bell pepper tacos';
update public.meals set tags = jsonb_build_array('meat', 'dinner') where name = 'Beef & Potato Curry Tacos';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein') where name = 'Beef Meatballs with Yoghurt & Herbs';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein', 'quick') where name = 'Chicken Thigh Fajita Tortillas';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein', 'quick') where name = 'Chicken tikka-style wraps';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'high_protein') where name = 'Crispy Chicken Thigh Tortilla Stack with Tomato & Feta';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Crispy Halloumi & Broccoli Tortilla Wraps';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Feta & pepper egg wraps';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Halloumi fajitas';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Halloumi wraps with herby yoghurt';
update public.meals set tags = jsonb_build_array('fish', 'dinner', 'quick', 'high_protein') where name = 'Salmon tacos with lemon yoghurt';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Spinach & Feta Egg Tortilla Wraps';

-- CURRY_STEW
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep', 'comfort_food', 'high_protein') where name = 'Beef keema with rice';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep', 'comfort_food') where name = 'Chicken & chickpea curry';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep', 'high_protein') where name = 'Chicken saag-style curry';
update public.meals set tags = jsonb_build_array('vegan', 'vegetarian', 'dinner', 'meal_prep', 'comfort_food') where name = 'Chickpea & potato coconut stew';
update public.meals set tags = jsonb_build_array('vegan', 'vegetarian', 'dinner', 'meal_prep', 'quick') where name = 'Chickpea & spinach curry';
update public.meals set tags = jsonb_build_array('fish', 'dinner') where name = 'Coconut salmon curry';
update public.meals set tags = jsonb_build_array('vegan', 'vegetarian', 'dinner', 'meal_prep', 'quick') where name = 'Curried Chickpea & Tomato Coconut Soup';
update public.meals set tags = jsonb_build_array('meat', 'dinner', 'meal_prep') where name = 'Minced Beef & Potato Coconut Stew';
update public.meals set tags = jsonb_build_array('vegan', 'vegetarian', 'dinner', 'meal_prep') where name = 'Spiced potato & spinach curry';

-- EGGS
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner') where name = 'Baked Eggs in Tomato & Chickpea Sauce with Spinach';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner') where name = 'Baked Eggs with Chickpea Tomato Sauce';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick') where name = 'Chickpea shakshuka';
update public.meals set tags = jsonb_build_array('fish', 'dinner', 'high_protein', 'quick') where name = 'Salmon & Potato Frittata';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'comfort_food', 'quick') where name = 'Shakshuka';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner') where name = 'Spanish tortilla with tomato salad';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick', 'high_protein', 'low_carb') where name = 'Spinach & feta omelette with potatoes';

-- SALAD
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick', 'low_carb', 'low_calorie') where name = 'Greek-style chickpea salad bowls';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'quick', 'high_protein') where name = 'Halloumi & Chickpea Buddha Bowl with Yoghurt Dressing';
update public.meals set tags = jsonb_build_array('vegetarian', 'dinner', 'low_carb', 'quick') where name = 'Pan-Seared Halloumi with Lemon Broccoli & Chickpea Salad';

-- ============================================================================
-- 7. Re-derive tags to fix quick inconsistency (10 meals at time=30 were
--    hard-coded as quick; function uses < 30)
-- ============================================================================

-- Force trigger to re-derive diet/quick/dinner while keeping curated tags
update public.meals set tags = tags where reviewed_at is not null;

-- ============================================================================
-- 8. Migrate user preferences: gym → high_protein, drop invalid tags
-- ============================================================================

update public.profiles p
set state = jsonb_set(
  p.state,
  '{prefs,tags}',
  coalesce((
    select jsonb_agg(distinct 
      case 
        when t = 'gym' then 'high_protein'
        else t 
      end
    )
    from jsonb_array_elements_text(p.state->'prefs'->'tags') t
    where t in ('quick', 'meal_prep', 'gym', 'high_protein', 'low_calorie', 'low_carb', 'comfort_food')
  ), '[]'::jsonb)
)
where jsonb_typeof(p.state->'prefs'->'tags') = 'array'
  and p.state->'prefs'->'tags' ?| array['gym', 'breakfast', 'lunch', 'snack'];

-- ============================================================================
-- 9. Add new ingredient keys with prices from the 4 stores
-- ============================================================================

-- Link existing butter to meal_key
update public.ingredient_prices set meal_key = 'butter' where slug = 'butter' and meal_key is null;

-- Tomato puree
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('tomato-puree', 'Tomato puree', 'pantry', 'tesco', 'tomato puree', 'Tesco Tomato Puree', '200g', 0.59, '£0.30 per 100g', false, '2026-10-06'),
  ('tomato-puree', 'Tomato puree', 'pantry', 'sainsburys', 'tomato puree', 'Sainsbury''s Tomato Puree Double Concentrate', '200g', 0.59, '£0.30 per 100g', false, '2026-10-06'),
  ('tomato-puree', 'Tomato puree', 'pantry', 'asda', 'tomato puree', 'ASDA Double Concentrate Tomato Puree', '200g', 0.70, '£0.35 per 100g', false, '2026-10-06'),
  ('tomato-puree', 'Tomato puree', 'pantry', 'waitrose', 'tomato puree', 'Waitrose Italian Tomato Puree Double Concentrated', null, 1.00, null, true, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Fresh ginger (Waitrose missing - correctly omitted)
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('fresh-ginger', 'Fresh ginger', 'veg', 'tesco', 'fresh ginger', 'Tesco Ginger', '100g', 1.25, '£1.25 per 100g', false, '2026-10-06'),
  ('fresh-ginger', 'Fresh ginger', 'veg', 'sainsburys', 'fresh ginger', 'Sainsbury''s Ginger', '100g', 1.25, '£1.25 per 100g', false, '2026-10-06'),
  ('fresh-ginger', 'Fresh ginger', 'veg', 'asda', 'fresh ginger', 'ASDA Sweet & Warming Ginger', '500g', 1.85, '£0.37 per 100g', false, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Note: Waitrose fresh ginger is missing from the pricing data

-- Garam masala
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('garam-masala', 'Garam masala', 'pantry', 'tesco', 'garam masala', 'Tesco Garam Masala Spice Blend', '38g', 1.00, '£2.63 per 100g', false, '2026-10-06'),
  ('garam-masala', 'Garam masala', 'pantry', 'sainsburys', 'garam masala', 'Sainsbury''s Garam Masala', '38g', 1.15, '£3.03 per 100g', false, '2026-10-06'),
  ('garam-masala', 'Garam masala', 'pantry', 'asda', 'garam masala', 'COOK by ASDA Garam Masala Spice Blend', '92g', 0.95, '£1.03 per 100g', false, '2026-10-06'),
  ('garam-masala', 'Garam masala', 'pantry', 'waitrose', 'garam masala', 'Cooks'' Ingredients Garam Masala', null, 1.80, null, true, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Limes
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('limes', 'Limes', 'fresh', 'tesco', 'limes', 'Tesco Limes Minimum 5', '5 pack', 1.15, '£0.23 each', false, '2026-10-06'),
  ('limes', 'Limes', 'fresh', 'sainsburys', 'limes', 'Sainsbury''s Limes', '5 pack', 1.15, '£0.23 each', false, '2026-10-06'),
  ('limes', 'Limes', 'fresh', 'asda', 'limes', 'ASDA 5 Limes', '5 pack', 1.18, '£0.24 each', false, '2026-10-06'),
  ('limes', 'Limes', 'fresh', 'waitrose', 'limes', '5 x Waitrose Loose Limes each', '5 pack', 1.50, '£0.30 each', false, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Spring onions
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('spring-onions', 'Spring onions', 'veg', 'tesco', 'spring onions', 'Tesco Bunched Spring Onions', '100g', 0.69, '£0.69 per 100g', false, '2026-10-06'),
  ('spring-onions', 'Spring onions', 'veg', 'sainsburys', 'spring onions', 'Sainsbury''s Spring Onions Bunch', '100g', 0.65, '£0.65 per 100g', false, '2026-10-06'),
  ('spring-onions', 'Spring onions', 'veg', 'asda', 'spring onions', 'ASDA Fragrant & Crunchy Spring Onions', null, 0.68, null, true, '2026-10-06'),
  ('spring-onions', 'Spring onions', 'veg', 'waitrose', 'spring onions', 'Trimmed Salad Onions', null, 1.50, null, true, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Penne
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('penne', 'Penne', 'grocery', 'tesco', 'penne', 'Hearty Food Co. Penne Pasta', '500g', 0.41, '£0.08 per 100g', false, '2026-10-06'),
  ('penne', 'Penne', 'grocery', 'sainsburys', 'penne', 'Stamford Street Co. Penne Pasta', '500g', 0.41, '£0.08 per 100g', false, '2026-10-06'),
  ('penne', 'Penne', 'grocery', 'asda', 'penne', 'ASDA Penne', '500g', 0.71, '£0.14 per 100g', false, '2026-10-06'),
  ('penne', 'Penne', 'grocery', 'waitrose', 'penne', 'Essential Penne', null, 1.40, null, true, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Arborio rice
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('arborio-rice', 'Arborio rice', 'grocery', 'tesco', 'arborio rice', 'Tesco Arborio Risotto Rice', '1kg', 3.30, '£0.33 per 100g', false, '2026-10-06'),
  ('arborio-rice', 'Arborio rice', 'grocery', 'sainsburys', 'arborio rice', 'Sainsbury''s Arborio Risotto Rice', '500g', 2.25, '£0.45 per 100g', false, '2026-10-06'),
  ('arborio-rice', 'Arborio rice', 'grocery', 'asda', 'arborio rice', 'ASDA Risotto Arborio Rice', '500g', 2.60, '£0.52 per 100g', false, '2026-10-06'),
  ('arborio-rice', 'Arborio rice', 'grocery', 'waitrose', 'arborio rice', 'Waitrose Arborio Risotto Rice', null, 2.65, null, true, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Fresh basil
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('fresh-basil', 'Fresh basil', 'veg', 'tesco', 'fresh basil', 'Tesco Fresh Cut Basil', '30g', 0.50, '£1.67 per 100g', false, '2026-10-06'),
  ('fresh-basil', 'Fresh basil', 'veg', 'sainsburys', 'fresh basil', 'Sainsbury''s Fresh Packed Basil', '30g', 0.50, '£1.67 per 100g', false, '2026-10-06'),
  ('fresh-basil', 'Fresh basil', 'veg', 'asda', 'fresh basil', 'ASDA Basil', null, 0.50, null, true, '2026-10-06'),
  ('fresh-basil', 'Fresh basil', 'veg', 'waitrose', 'fresh basil', 'Cooks'' Ingredients Basil', null, 0.75, null, true, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Cucumber
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('cucumber', 'Cucumber', 'veg', 'tesco', 'cucumber', 'Tesco Whole Cucumber Each', 'each', 0.99, '£0.99 each', false, '2026-10-06'),
  ('cucumber', 'Cucumber', 'veg', 'sainsburys', 'cucumber', 'Sainsbury''s Small Whole Cucumber', 'each', 0.70, '£0.70 each', false, '2026-10-06'),
  ('cucumber', 'Cucumber', 'veg', 'asda', 'cucumber', 'ASDA Cucumber', 'each', 0.99, '£0.99 each', false, '2026-10-06'),
  ('cucumber', 'Cucumber', 'veg', 'waitrose', 'cucumber', 'Waitrose Midi Cucumber each', 'each', 0.75, '£0.75 each', false, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Red onions
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('red-onions', 'Red onions', 'veg', 'tesco', 'red onions', 'Tesco Red Onions Minimum 3', '3 pack', 1.00, '£0.33 each', false, '2026-10-06'),
  ('red-onions', 'Red onions', 'veg', 'sainsburys', 'red onions', 'Sainsbury''s Red Onions', '1kg', 0.95, '£0.10 per 100g', false, '2026-10-06'),
  ('red-onions', 'Red onions', 'veg', 'asda', 'red onions', 'ASDA 3 Sweet & Crunchy Red Onions', '3 pack', 0.95, '£0.32 each', false, '2026-10-06'),
  ('red-onions', 'Red onions', 'veg', 'waitrose', 'red onions', 'Waitrose Red Onions', null, 1.00, null, true, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

-- Cheddar
insert into public.ingredient_prices
  (slug, display_name, category, store, meal_key, product_name, pack_size, price_gbp, unit_price, is_estimate, captured_on)
values
  ('cheddar', 'Cheddar', 'dairy', 'tesco', 'cheddar', 'Creamfields Mature White Cheddar', '400g', 2.45, '£0.61 per 100g', false, '2026-10-06'),
  ('cheddar', 'Cheddar', 'dairy', 'sainsburys', 'cheddar', 'Sainsbury''s British Mature Cheddar Cheese', '400g', 2.95, '£0.74 per 100g', false, '2026-10-06'),
  ('cheddar', 'Cheddar', 'dairy', 'asda', 'cheddar', 'ASDA British Mature Cheddar', '400g', 2.95, '£0.74 per 100g', false, '2026-10-06'),
  ('cheddar', 'Cheddar', 'dairy', 'waitrose', 'cheddar', 'Essential Mature Cheddar Cheese Strength 4', null, 2.70, null, true, '2026-10-06')
on conflict (slug, store) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  meal_key = excluded.meal_key,
  product_name = excluded.product_name,
  pack_size = excluded.pack_size,
  price_gbp = excluded.price_gbp,
  unit_price = excluded.unit_price,
  is_estimate = excluded.is_estimate,
  captured_on = excluded.captured_on;

commit;

-- ============================================================================
-- Summary
-- ============================================================================
-- Added: meals.category column
-- Backfilled: 77 meals with categories (pasta=16, rice_bowl=15, oven_bake=15,
--   tacos_wraps=12, curry_stew=9, eggs=7, salad=3)
-- Updated: tags on all 77 meals (removed gym/breakfast/lunch/snack, set curated)
-- Changed: quick threshold from ≤20 to <30 minutes
-- Changed: vegan dishes now also carry vegetarian tag
-- Updated: meal_tags_for function to only derive diet/dinner/quick
-- Added: SECURITY DEFINER trigger to maintain derived tags while preserving curated ones
-- Re-derived: all tags to fix quick inconsistency (10 meals at time=30)
-- Migrated: user prefs (gym → high_protein, dropped invalid tags)
-- Added: 11 new ingredient keys with 4-store prices (43 new rows)
-- Tightened: category CHECK (null only when unverified)
-- Tightened: tags CHECK (vegan implies vegetarian)
--
-- Missing prices noted in PR:
--   - Waitrose fresh ginger (no product found, correctly omitted)
--   - 'size not listed' (is_estimate=true) for: waitrose tomato-puree, 
--     asda/waitrose spring-onions, waitrose penne, waitrose arborio-rice,
--     asda/waitrose fresh-basil, waitrose red-onions, waitrose cheddar
