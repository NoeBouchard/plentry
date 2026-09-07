-- Hero photos for seed meals (licensed Unsplash food photography).
-- SAFE TO RE-RUN. Adds image_url and backfills the 40 seed dishes.

alter table public.meals add column if not exists image_url text;

update public.meals set image_url = v.url
from (values
  ('Chicken & chickpea curry', 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Salmon traybake', 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Beef ragù spaghetti', 'https://images.unsplash.com/photo-1551892374-ecf8754cf8b0?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Halloumi fajitas', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Shakshuka', 'https://images.unsplash.com/photo-1590412200988-a436970781fa?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Chickpea & spinach curry', 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Greek chicken bowls', 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Veggie spaghetti pomodoro', 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Lemon garlic roast chicken & potatoes', 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Beef keema with rice', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Salmon & broccoli pasta', 'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Spanish tortilla with tomato salad', 'https://images.unsplash.com/photo-1608039829572-dee9b9547d0d?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Halloumi & chickpea traybake', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Chicken tikka-style wraps', 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Egg fried rice with broccoli', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Beef & bell pepper tacos', 'https://images.unsplash.com/photo-1551504734-5ee1c36e3989?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Coconut salmon curry', 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Baked feta pasta', 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Chicken & broccoli rice bowls', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Spiced potato & spinach curry', 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Beef meatballs in tomato sauce', 'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Halloumi wraps with herby yoghurt', 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Chickpea shakshuka', 'https://images.unsplash.com/photo-1590412200988-a436970781fa?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Lemon chicken & parmesan rice', 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Crispy salmon & smashed potatoes', 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Beef stuffed peppers', 'https://images.unsplash.com/photo-1604467715873-828d3868e8f1?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Chicken saag-style curry', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Greek-style chickpea salad bowls', 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Spinach & feta omelette with potatoes', 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Tomato & parmesan baked rice', 'https://images.unsplash.com/photo-1536304993881-47c5e0f0b6e1?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Curried beef & potato traybake', 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Halloumi & broccoli grain bowls', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Chicken fajita rice', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Salmon tacos with lemon yoghurt', 'https://images.unsplash.com/photo-1551504734-5ee1c36e3989?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Spaghetti aglio e olio with spinach', 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Chickpea & potato coconut stew', 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Beef & broccoli fried rice', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Feta & pepper egg wraps', 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Chicken parm-style bake', 'https://images.unsplash.com/photo-1632778149955-e80f8ceca18e?auto=format&fit=crop&w=800&h=520&q=80'),
  ('Tandoori-style yoghurt chicken with rice', 'https://images.unsplash.com/photo-1599487488170-d91ec13f0cf0?auto=format&fit=crop&w=800&h=520&q=80')
) as v(name, url)
where public.meals.name = v.name;
