-- Safety net only: add salt and black pepper if a meal is missing them.
-- SAFE TO RE-RUN. Does NOT invent dish spices — those live on each meal's `ing`
-- from the 8 Sep 2026 catalog review (catalog_review_2026_09_08.sql).
-- Paste in the SQL editor after seed_meals.sql if needed.

update public.meals m
set ing = sub.ing
from (
  select
    m2.id,
    (
      select jsonb_agg(i order by i)
      from (
        select distinct trim(e) as i
        from jsonb_array_elements_text(
          m2.ing || '["salt","black pepper"]'::jsonb
        ) as e
        where trim(e) in (
          'chicken thighs','salmon fillet','minced beef','halloumi','eggs','chickpeas',
          'rice','spaghetti','tortillas','coconut milk','curry paste','passata',
          'onions','garlic','bell peppers','broccoli','spinach','tomatoes',
          'lemons','potatoes','olive oil','feta','yoghurt','parmesan',
          'chopped tomatoes','butter','fresh coriander',
          'salt','black pepper','paprika','cumin','chilli flakes','mixed herbs','soy sauce','stock cubes'
        )
      ) d
    ) as ing
  from public.meals m2
) sub
where m.id = sub.id
  and sub.ing is not null;
