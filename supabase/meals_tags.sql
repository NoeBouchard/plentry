-- Plentry — meal tags + newcoming review queue. SAFE TO RE-RUN.
-- Applied 9 Sep 2026. Keep in sync with tagsFor() in index.html and ai/index.ts.
--
-- tags: closed set, several per meal. reviewed_at NULL = newcoming (Ops + fortnight Telegram).
-- Current catalog (created before 2026-09-09) is marked reviewed after backfill.

alter table public.meals add column if not exists tags jsonb;
alter table public.meals add column if not exists reviewed_at timestamptz;

create or replace function public.meal_tags_for(p_name text, p_ing jsonb, p_time int)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  n text := lower(coalesce(p_name, ''));
  t int := coalesce(p_time, 25);
  tags text[] := '{}';
  diet text;
  has_meat boolean;
  has_fish boolean;
  has_animal boolean;
  has_protein boolean;
  has_carbs boolean;
begin
  has_meat := p_ing ?| array['chicken thighs', 'minced beef'];
  has_fish := p_ing ? 'salmon fillet';
  has_animal := p_ing ?| array['chicken thighs', 'minced beef', 'salmon fillet', 'eggs', 'feta', 'halloumi', 'yoghurt', 'parmesan', 'butter'];
  has_protein := p_ing ?| array['chicken thighs', 'minced beef', 'salmon fillet', 'eggs', 'halloumi', 'yoghurt', 'chickpeas', 'feta'];
  has_carbs := p_ing ?| array['rice', 'spaghetti', 'tortillas', 'potatoes'];

  if has_meat then diet := 'meat';
  elsif has_fish then diet := 'fish';
  elsif not has_animal then diet := 'vegan';
  else diet := 'vegetarian';
  end if;
  tags := array_append(tags, diet);

  if has_protein then tags := array_append(tags, 'high_protein'); end if;
  if not has_carbs then tags := array_append(tags, 'low_carb'); end if;
  if diet in ('vegan', 'vegetarian')
     and not (p_ing ? 'coconut milk')
     and not (p_ing ? 'spaghetti')
     and not (p_ing ? 'halloumi')
     and not (p_ing ? 'feta')
     and not (p_ing ? 'parmesan')
     and t <= 25
     and n !~ 'pasta|bake|fried rice|mash|curry|stew|meatball'
  then tags := array_append(tags, 'low_calorie'); end if;

  tags := array_append(tags, 'dinner');
  if n ~ 'omelette|shakshuka|frittata|baked eggs|spanish tortilla' then tags := array_append(tags, 'breakfast'); end if;
  if n ~ 'bowl|wrap|taco|salad|soup|omelette|fajita|frittata' then tags := array_append(tags, 'lunch'); end if;
  if t <= 20 then tags := array_append(tags, 'quick'); end if;
  if n ~ 'curry|stew|ragù|ragu|bolognese|traybake|casserole|keema|baked rice|soup' then tags := array_append(tags, 'meal_prep'); end if;
  if 'high_protein' = any (tags) and (diet in ('meat', 'fish') or p_ing ? 'eggs' or p_ing ? 'halloumi') then
    tags := array_append(tags, 'gym');
  end if;
  if n ~ 'pasta|spaghetti|curry|meatball|mash|bake|fried rice|shakshuka|parm|ragù|ragu|stew|bolognese' then
    tags := array_append(tags, 'comfort_food');
  end if;

  return to_jsonb(tags);
end;
$$;

revoke all on function public.meal_tags_for(text, jsonb, integer) from public, anon, authenticated;

update public.meals
set tags = public.meal_tags_for(name, ing, time)
where tags is null or jsonb_typeof(tags) <> 'array' or jsonb_array_length(tags) = 0;

-- Founder-reviewed catalog (ingredients + methods, 8 Sep 2026). Do not re-review
-- dinners created on/after 9 Sep 2026 — those stay newcoming until Ops marks them.
update public.meals
set reviewed_at = timestamptz '2026-09-08 12:00:00+00'
where reviewed_at is null
  and created_at < timestamptz '2026-09-09 00:00:00+00';

alter table public.meals drop constraint if exists meals_tags_shape;
alter table public.meals add constraint meals_tags_shape
  check (
    tags is not null
    and jsonb_typeof(tags) = 'array'
    and jsonb_array_length(tags) between 1 and 12
    and tags <@ '[
      "vegetarian","vegan","meat","fish",
      "low_calorie","high_protein","low_carb",
      "breakfast","lunch","dinner","snack",
      "gym","meal_prep","quick","comfort_food"
    ]'::jsonb
    and (tags ? 'dinner')
    and (
      (tags ? 'meat')::int + (tags ? 'fish')::int + (tags ? 'vegetarian')::int + (tags ? 'vegan')::int
    ) = 1
  );

create index if not exists meals_newcoming_idx
  on public.meals (created_at desc)
  where reviewed_at is null;

drop policy if exists "admin update meals review" on public.meals;
create policy "admin update meals review" on public.meals
  for update using ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com')
  with check ((auth.jwt()->>'email') = 'noyouchka.bouchard@gmail.com');

grant select, update on public.meals to authenticated;

-- Cron: ping Telegram if any newcoming rows remain. Reuses ORDER_WEBHOOK_SECRET
-- from notify_order_webhook_fn so the secret is not stored a second time in git.
create or replace function public.invoke_newcoming_review()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  src text;
  secret text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'notify_order_webhook_fn'
  limit 1;
  secret := substring(src from 'x-webhook-secret'',''([^'']+)');
  if secret is null or secret = '' or secret like '%ORDER_WEBHOOK%' then
    raise notice 'newcoming cron skipped: webhook secret not found';
    return;
  end if;
  perform net.http_post(
    url := 'https://ucciqthwxnlkjalwlhvh.supabase.co/functions/v1/newcoming',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 8000
  );
end;
$$;

revoke all on function public.invoke_newcoming_review() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
exception when others then
  raise notice 'pg_cron not enabled: %', SQLERRM;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('plentry-newcoming-fortnight');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'plentry-newcoming-fortnight',
      '0 9 1,15 * *',
      $c$select public.invoke_newcoming_review()$c$
    );
  end if;
end $$;
