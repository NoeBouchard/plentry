-- Unapplied on purpose. Not a migration: keep this file out of supabase/migrations/.
-- Production public.meals.image_url still stores two Unsplash IDs that return 404.
-- Chrome blocks that HTML, so the dinner cards fail.
-- Run by hand in the SQL editor. One update per meal. Does not touch other rows.

begin;

update public.meals
set image_url = 'https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?auto=format&fit=crop&w=800&h=520&q=80'
where name = 'Chicken parm-style bake';

update public.meals
set image_url = 'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?auto=format&fit=crop&w=800&h=520&q=80'
where name = 'Beef & bell pepper tacos';

update public.meals
set image_url = 'https://images.unsplash.com/photo-1696935191484-7677e929b0dc?auto=format&fit=crop&w=800&h=520&q=80'
where name = 'Salmon tacos with lemon yoghurt';

commit;

-- Rollback (the two taco dinners shared the first old URL):
-- begin;
-- update public.meals
-- set image_url = 'https://images.unsplash.com/photo-1632778149955-e80f8ceca18e?auto=format&fit=crop&w=800&h=520&q=80'
-- where name = 'Chicken parm-style bake';
-- update public.meals
-- set image_url = 'https://images.unsplash.com/photo-1551504734-5ee1c36e3989?auto=format&fit=crop&w=800&h=520&q=80'
-- where name = 'Beef & bell pepper tacos';
-- update public.meals
-- set image_url = 'https://images.unsplash.com/photo-1551504734-5ee1c36e3989?auto=format&fit=crop&w=800&h=520&q=80'
-- where name = 'Salmon tacos with lemon yoghurt';
-- commit;
