-- Unapplied on purpose. Not a migration: keep this file out of supabase/migrations/.
-- Production public.meals.image_url still stores Unsplash IDs that return 404.
-- Chrome blocks that HTML, so the dinner cards fail.
-- Run by hand in the SQL editor. One update per meal name. Does not touch other rows.
-- Read-only check on 25 Oct 2026 (project ucciqthwxnlkjalwlhvh): the four later IDs
-- are on Spanish tortilla with tomato salad, Creamy Spinach & Feta Baked Potatoes
-- (same URL as the tortilla), Beef stuffed peppers, Tandoori-style yoghurt chicken
-- with rice, and Baked tomato & basil risotto. There is no row named
-- Tomato & parmesan baked rice; that update matches nothing until the seed name exists.

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

update public.meals
set image_url = 'https://images.unsplash.com/photo-1639669794539-952631b44515?auto=format&fit=crop&w=800&h=520&q=80'
where name = 'Spanish tortilla with tomato salad';

update public.meals
set image_url = 'https://images.unsplash.com/photo-1639669794539-952631b44515?auto=format&fit=crop&w=800&h=520&q=80'
where name = 'Creamy Spinach & Feta Baked Potatoes';

update public.meals
set image_url = 'https://images.unsplash.com/photo-1592119747782-d8c12c2ea267?auto=format&fit=crop&w=800&h=520&q=80'
where name = 'Beef stuffed peppers';

update public.meals
set image_url = 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=800&h=520&q=80'
where name = 'Baked tomato & basil risotto';

update public.meals
set image_url = 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=800&h=520&q=80'
where name = 'Tomato & parmesan baked rice';

update public.meals
set image_url = 'https://images.unsplash.com/photo-1617692855027-33b14f061079?auto=format&fit=crop&w=800&h=520&q=80'
where name = 'Tandoori-style yoghurt chicken with rice';

commit;

-- Rollback (old URLs from the 25 Oct 2026 read; the two taco dinners shared one,
-- and Spanish tortilla shared its URL with Creamy Spinach & Feta Baked Potatoes):
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
-- update public.meals
-- set image_url = 'https://images.unsplash.com/photo-1608039829572-dee9b9547d0d?auto=format&fit=crop&w=800&h=520&q=80'
-- where name = 'Spanish tortilla with tomato salad';
-- update public.meals
-- set image_url = 'https://images.unsplash.com/photo-1608039829572-dee9b9547d0d?auto=format&fit=crop&w=800&h=520&q=80'
-- where name = 'Creamy Spinach & Feta Baked Potatoes';
-- update public.meals
-- set image_url = 'https://images.unsplash.com/photo-1604467715873-828d3868e8f1?auto=format&fit=crop&w=800&h=520&q=80'
-- where name = 'Beef stuffed peppers';
-- update public.meals
-- set image_url = 'https://images.unsplash.com/photo-1536304993881-47c5e0f0b6e1?auto=format&fit=crop&w=800&h=520&q=80'
-- where name = 'Baked tomato & basil risotto';
-- update public.meals
-- set image_url = 'https://images.unsplash.com/photo-1536304993881-47c5e0f0b6e1?auto=format&fit=crop&w=800&h=520&q=80'
-- where name = 'Tomato & parmesan baked rice';
-- update public.meals
-- set image_url = 'https://images.unsplash.com/photo-1599487488170-d91ec13f0cf0?auto=format&fit=crop&w=800&h=520&q=80'
-- where name = 'Tandoori-style yoghurt chicken with rice';
-- commit;
