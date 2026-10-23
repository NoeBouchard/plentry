-- One ingredient price per meal, per shop, for 2, 4 and 6 servings.
-- NOT APPLIED to production by the PR that adds this file. Do not run it
-- against prod from that change. Safe to re-run. Does not change any
-- ingredient_prices row.
--
-- price = sum over grocery portions of (scaled amount / pack) * pack price.
-- Scale matches scalePortion: servings/2, onions and garlic at 6 servings use
-- 0.75 of that factor, pc and clove round up with ceil. The pack is the shop
-- row when pack_unit matches the catalog unit or converts g/kg or ml/l;
-- otherwise it is the catalog pack below. Seasonings are not in the sum
-- (the basket still buys one jar). A missing shop price, or a grocery with
-- no usable portion, sets incomplete and leaves price_gbp null.
-- Keep in step with mealIngredientQuote in index.html.

create table if not exists public.meal_ingredient_prices (
  meal_id bigint not null references public.meals(id) on delete cascade,
  store text not null check (store in ('tesco','sainsburys','asda','waitrose')),
  servings smallint not null check (servings in (2, 4, 6)),
  price_gbp numeric(12, 2),
  incomplete boolean not null default false,
  missing text[] not null default '{}',
  primary key (meal_id, store, servings)
);

alter table public.meal_ingredient_prices enable row level security;

drop policy if exists "read meal ingredient prices" on public.meal_ingredient_prices;
create policy "read meal ingredient prices" on public.meal_ingredient_prices
  for select using (true);

grant select on public.meal_ingredient_prices to anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create or replace function private.refresh_meal_ingredient_prices(p_meal bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.meals%rowtype;
  stores text[] := array['tesco','sainsburys','asda','waitrose'];
  svs int[] := array[2, 4, 6];
  catalog jsonb := '{
    "chicken thighs":{"pack":4,"pu":"pc"},
    "salmon fillet":{"pack":2,"pu":"pc"},
    "minced beef":{"pack":500,"pu":"g"},
    "halloumi":{"pack":225,"pu":"g"},
    "eggs":{"pack":6,"pu":"pc"},
    "chickpeas":{"pack":400,"pu":"g"},
    "rice":{"pack":1000,"pu":"g"},
    "spaghetti":{"pack":500,"pu":"g"},
    "tortillas":{"pack":8,"pu":"pc"},
    "coconut milk":{"pack":400,"pu":"ml"},
    "curry paste":{"pack":12,"pu":"tbsp"},
    "passata":{"pack":500,"pu":"g"},
    "onions":{"pack":6,"pu":"pc"},
    "garlic":{"pack":40,"pu":"clove"},
    "bell peppers":{"pack":3,"pu":"pc"},
    "broccoli":{"pack":1,"pu":"pc"},
    "spinach":{"pack":240,"pu":"g"},
    "tomatoes":{"pack":6,"pu":"pc"},
    "lemons":{"pack":4,"pu":"pc"},
    "potatoes":{"pack":2000,"pu":"g"},
    "olive oil":{"pack":33,"pu":"tbsp"},
    "feta":{"pack":200,"pu":"g"},
    "yoghurt":{"pack":500,"pu":"g"},
    "parmesan":{"pack":80,"pu":"g"},
    "chopped tomatoes":{"pack":400,"pu":"g"},
    "butter":{"pack":250,"pu":"g"},
    "fresh coriander":{"pack":30,"pu":"g"},
    "tomato puree":{"pack":200,"pu":"g"},
    "fresh ginger":{"pack":100,"pu":"g"},
    "limes":{"pack":5,"pu":"pc"},
    "spring onions":{"pack":6,"pu":"pc"},
    "penne":{"pack":500,"pu":"g"},
    "arborio rice":{"pack":500,"pu":"g"},
    "fresh basil":{"pack":30,"pu":"g"},
    "cucumber":{"pack":1,"pu":"pc"},
    "red onions":{"pack":3,"pu":"pc"},
    "cheddar":{"pack":400,"pu":"g"}
  }'::jsonb;
  seasonings text[] := array['salt','black pepper','paprika','cumin','chilli flakes','mixed herbs','soy sauce','stock cubes','garam masala'];
  st text;
  sv int;
  portions jsonb;
  ing jsonb;
  k text;
  spec jsonb;
  missing text[];
  total numeric;
  incomplete boolean;
  code_pack numeric;
  code_pu text;
  price numeric;
  sq numeric;
  su text;
  pack numeric;
  qty numeric;
  factor numeric;
  amount numeric;
begin
  delete from public.meal_ingredient_prices where meal_id = p_meal;
  select * into m from public.meals where id = p_meal;
  if not found then
    return;
  end if;
  portions := m.portions;
  if portions is null or jsonb_typeof(portions) <> 'object' then
    portions := '{}'::jsonb;
  end if;
  ing := m.ing;
  if ing is null or jsonb_typeof(ing) <> 'array' then
    ing := '[]'::jsonb;
  end if;

  foreach st in array stores loop
    foreach sv in array svs loop
      missing := array[]::text[];
      total := 0;
      if jsonb_array_length(ing) > 0 then
        for k in select jsonb_array_elements_text(ing) loop
          if k = any(seasonings) then
            continue;
          end if;
          code_pu := catalog->k->>'pu';
          if code_pu is null or code_pu = '' then
            continue;
          end if;
          if not (portions ? k) then
            missing := array(select distinct unnest(missing || k));
          end if;
        end loop;
      end if;
      for k, spec in select * from jsonb_each(portions) loop
        if k = any(seasonings) then
          continue;
        end if;
        code_pu := catalog->k->>'pu';
        code_pack := nullif(catalog->k->>'pack', '')::numeric;
        if code_pu is null or code_pu = '' or code_pack is null or code_pack <= 0 then
          missing := array(select distinct unnest(missing || k));
          continue;
        end if;
        if jsonb_typeof(spec) <> 'array' or jsonb_array_length(spec) < 2 or (spec->>1) is distinct from code_pu then
          missing := array(select distinct unnest(missing || k));
          continue;
        end if;
        price := null;
        sq := null;
        su := null;
        select p.price_gbp, p.pack_qty, lower(coalesce(p.pack_unit, ''))
          into price, sq, su
        from public.ingredient_prices p
        where p.meal_key = k and p.store = st and p.price_gbp is not null
        order by p.id asc nulls last
        limit 1;
        if price is null then
          missing := array(select distinct unnest(missing || k));
          continue;
        end if;
        pack := code_pack;
        if sq is not null and sq > 0 then
          if su = code_pu then
            pack := sq;
          elsif (code_pu = 'g' and su = 'kg') or (code_pu = 'ml' and su = 'l') then
            pack := sq * 1000;
          elsif (code_pu = 'kg' and su = 'g') or (code_pu = 'l' and su = 'ml') then
            pack := sq / 1000;
          end if;
        end if;
        begin
          amount := (spec->>0)::numeric;
        exception when others then
          missing := array(select distinct unnest(missing || k));
          continue;
        end;
        if amount is null or amount < 0 or pack is null or pack <= 0 then
          missing := array(select distinct unnest(missing || k));
          continue;
        end if;
        factor := sv / 2.0;
        if (k = 'onions' or k = 'garlic') and sv = 6 then
          factor := 0.75 * factor;
        end if;
        qty := amount * factor;
        if code_pu in ('pc', 'clove') then
          qty := ceil(qty);
        end if;
        total := total + (qty / pack) * price;
      end loop;
      incomplete := coalesce(array_length(missing, 1), 0) > 0 or m.portions is null;
      insert into public.meal_ingredient_prices (meal_id, store, servings, price_gbp, incomplete, missing)
      values (
        p_meal,
        st,
        sv,
        case when incomplete then null else round(total * 100) / 100 end,
        incomplete,
        coalesce(missing, array[]::text[])
      );
    end loop;
  end loop;
end;
$$;

revoke all on function private.refresh_meal_ingredient_prices(bigint) from public;
revoke all on function private.refresh_meal_ingredient_prices(bigint) from anon, authenticated;

create or replace function private.meal_ingredient_prices_meal_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.refresh_meal_ingredient_prices(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

revoke all on function private.meal_ingredient_prices_meal_trg() from public;
revoke all on function private.meal_ingredient_prices_meal_trg() from anon, authenticated;

drop trigger if exists meal_ingredient_prices_meal on public.meals;
create trigger meal_ingredient_prices_meal
  after insert or update of ing, portions or delete
  on public.meals
  for each row execute function private.meal_ingredient_prices_meal_trg();

create or replace function private.meal_ingredient_prices_shelf_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  keys text[] := array[]::text[];
  k text;
  mid bigint;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.meal_key is not null then
    keys := keys || old.meal_key;
  end if;
  if tg_op in ('UPDATE', 'INSERT') and new.meal_key is not null then
    keys := keys || new.meal_key;
  end if;
  for k in select distinct unnest(keys) loop
    for mid in
      select m.id from public.meals m
      where coalesce(m.ing, '[]'::jsonb) ? k
         or coalesce(m.portions, '{}'::jsonb) ? k
    loop
      perform private.refresh_meal_ingredient_prices(mid);
    end loop;
  end loop;
  return coalesce(new, old);
end;
$$;

revoke all on function private.meal_ingredient_prices_shelf_trg() from public;
revoke all on function private.meal_ingredient_prices_shelf_trg() from anon, authenticated;

drop trigger if exists meal_ingredient_prices_shelf on public.ingredient_prices;
create trigger meal_ingredient_prices_shelf
  after insert or update of price_gbp, pack_qty, pack_unit, meal_key or delete
  on public.ingredient_prices
  for each row execute function private.meal_ingredient_prices_shelf_trg();

-- Fill from the meals and prices already stored. Does not write ingredient_prices.
do $$
declare
  mid bigint;
begin
  for mid in select id from public.meals loop
    perform private.refresh_meal_ingredient_prices(mid);
  end loop;
end $$;
