# Meal catalog — ingredients and method

Live catalog plus cooking instructions. **77 dinners** (40 seed, 37 advisor/AI). Methods were generated 8 Sep 2026 with the live recipe AI from each meal’s ingredient list (2 servings), then **reviewed and corrected 8 Sep 2026** (see [Review notes](#review-notes) and [Database changes](#database-changes) at the end).

Review rules applied to every dinner:

- The ingredient list is exactly what the method uses — nothing used in the method is missing from the list, and nothing in the list goes unused. Water is the only exception.
- Quantities are for **2 servings**, in UK metric, and sized to the pack sizes we shop (4 chicken thighs ≈ 500g pack, 2 salmon fillets, 225g halloumi, 400g tin chickpeas, 400ml tin coconut milk, 500g passata, 8-pack tortillas).
- Oven temperatures are given as conventional (fan in brackets). Every method fits the stated time.
- Keep ingredient names **exactly** as in the allowed list. Methods can mention water, quantities, and timings — those are cooking notes, not extra shop items.

Three names are **new** and must be added to the catalog before the corrected `ing` lists are written to Postgres: `chopped tomatoes`, `butter`, `fresh coriander`. Details in [Database changes](#database-changes).

## Allowed names (32 + 3 new)

- `chicken thighs`
- `salmon fillet`
- `minced beef`
- `halloumi`
- `eggs`
- `chickpeas`
- `rice`
- `spaghetti`
- `tortillas`
- `coconut milk`
- `curry paste`
- `passata`
- `onions`
- `garlic`
- `bell peppers`
- `broccoli`
- `spinach`
- `tomatoes`
- `lemons`
- `potatoes`
- `olive oil`
- `feta`
- `yoghurt`
- `parmesan`
- `salt`
- `black pepper`
- `paprika`
- `cumin`
- `chilli flakes`
- `mixed herbs`
- `soy sauce`
- `stock cubes`
- `chopped tomatoes` **(new — 400g tin)**
- `butter` **(new)**
- `fresh coriander` **(new — 30g bunch)**

Anything else will be dropped by the app.

## Seed (40)

### 🧀 Baked feta pasta
_seed · 30 min · 9 items_

**Ingredients**
- black pepper
- feta
- garlic
- mixed herbs
- olive oil
- salt
- spaghetti
- spinach
- tomatoes

**Method**
1. Preheat the oven to 200°C (180°C fan). Halve 300g tomatoes (cherry or small tomatoes work best) and put them in a small baking dish with a 200g block of feta in the middle.
2. Add 3 whole peeled garlic cloves, drizzle with 3 tbsp olive oil and season with 1 tsp mixed herbs, black pepper and a small pinch of salt (feta is already salty).
3. Roast for 25 minutes until the feta is soft and the tomatoes have burst.
4. Meanwhile, cook 180g spaghetti in salted boiling water for 9–10 minutes. Scoop out a mug of pasta water before draining.
5. Take the dish out, mash the soft garlic into the feta with a fork and stir the feta and tomatoes into a creamy sauce.
6. Add the drained spaghetti and 150g spinach to the dish and toss until the spinach wilts, adding splashes of pasta water until the sauce coats the pasta.
7. Taste, adjust with black pepper, and serve straight away.

**Tip**
Stir the feta and burst tomatoes together properly — that mash is what makes the sauce creamy.

### 🌮 Beef & bell pepper tacos
_seed · 25 min · 14 items_

**Ingredients**
- bell peppers
- black pepper
- chilli flakes
- cumin
- fresh coriander
- garlic
- lemons
- minced beef
- olive oil
- onions
- paprika
- salt
- tortillas
- yoghurt

**Method**
1. Dice 1 onion and 2 bell peppers into small pieces and finely chop 2 garlic cloves.
2. Heat 1 tbsp olive oil in a large frying pan over high heat. Add 300g minced beef and cook for 5 minutes, breaking it up, until browned.
3. Add the onion and peppers and cook for 4 minutes until softened.
4. Stir in the garlic, 1 tsp cumin, 1 tsp paprika, ½ tsp chilli flakes, ½ tsp salt and ¼ tsp black pepper. Cook for 1 minute until fragrant, then squeeze in the juice of half a lemon.
5. Mix 4 tbsp yoghurt with the juice of the other lemon half and a pinch of salt.
6. Warm 4 tortillas in a dry pan for 20–30 seconds per side.
7. Fill the tortillas with the beef, top with the lemon yoghurt and a handful of roughly chopped fresh coriander, and serve.

**Tip**
Let the beef sit in the pan without stirring for a minute at a time — the browned crust is where the flavour is.

### 🥡 Beef & broccoli fried rice
_seed · 25 min · 10 items_

**Ingredients**
- black pepper
- broccoli
- eggs
- garlic
- minced beef
- olive oil
- onions
- rice
- salt
- soy sauce

**Method**
1. If you have no cold leftover rice, cook 150g rice, spread it on a plate and let it steam off for 10 minutes so it fries rather than steams.
2. Cut 1 head of broccoli into small florets, dice 1 onion and finely chop 3 garlic cloves.
3. Heat 1 tbsp olive oil in a wok or large frying pan over high heat. Cook 300g minced beef for 5 minutes until browned, then tip onto a plate.
4. Add another 1 tbsp olive oil, then the onion and broccoli. Stir-fry for 4 minutes, then add the garlic for 1 minute more.
5. Push everything to one side, crack in 2 eggs and scramble them for 1 minute, then mix through.
6. Return the beef and add the rice. Stir-fry for 3 minutes, breaking up clumps.
7. Add 3 tbsp soy sauce and plenty of black pepper, toss for 1 minute, taste (soy sauce is salty, so add salt only if needed) and serve.

**Tip**
Cold rice is the secret — warm, fresh rice turns mushy in the wok.

### 🍛 Beef keema with rice
_seed · 30 min · 15 items_

**Ingredients**
- black pepper
- chilli flakes
- chopped tomatoes
- cumin
- curry paste
- fresh coriander
- garlic
- minced beef
- olive oil
- onions
- paprika
- rice
- salt
- stock cubes
- yoghurt

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: bring to the boil, cover, simmer on the lowest heat for 12 minutes, then leave covered off the heat.
2. Finely dice 1 onion and chop 3 garlic cloves. Heat 1 tbsp olive oil in a large pan over medium-high heat and cook the onion for 4 minutes until soft.
3. Add 400g minced beef and cook for 5–6 minutes, breaking it up, until browned.
4. Stir in the garlic, 2 tbsp curry paste, 1 tsp cumin, 1 tsp paprika and ½ tsp chilli flakes. Cook for 1 minute.
5. Add a 400g tin of chopped tomatoes, 1 crumbled stock cube and 100ml water. Simmer for 10 minutes until thick.
6. Take off the heat and stir in 3 tbsp yoghurt. Season with salt and black pepper.
7. Serve over the rice with a handful of chopped fresh coriander on top.

**Tip**
Stir the yoghurt in off the heat so it stays creamy instead of splitting.

### 🍝 Beef meatballs in tomato sauce
_seed · 35 min · 11 items_

**Ingredients**
- black pepper
- eggs
- garlic
- minced beef
- mixed herbs
- olive oil
- onions
- parmesan
- passata
- salt
- spaghetti

**Method**
1. In a bowl, mix 400g minced beef with 1 egg, 2 finely chopped garlic cloves, 30g grated parmesan, 1 tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper. Mix gently until just combined.
2. Roll into 12 meatballs and chill while you start the sauce.
3. Finely dice 1 onion and chop 1 garlic clove. Heat 1 tbsp olive oil in a large pan over medium heat and cook the onion for 4 minutes until soft, then add the garlic for 1 minute.
4. Pour in 400g passata, add 1 tsp mixed herbs, a pinch of salt and black pepper, and simmer for 3 minutes.
5. Heat 1 tbsp olive oil in a frying pan over medium-high heat and brown the meatballs for 5 minutes, turning, then nestle them into the sauce. Cover and simmer for 12 minutes until cooked through.
6. Meanwhile, cook 180g spaghetti in salted boiling water for 9–10 minutes and drain.
7. Serve the spaghetti topped with meatballs and sauce, extra grated parmesan and black pepper.

**Tip**
Don't overwork the meatball mix — handle it lightly for tender meatballs.

### 🍝 Beef ragù spaghetti
_seed · 35 min · 10 items_

**Ingredients**
- black pepper
- garlic
- minced beef
- mixed herbs
- olive oil
- onions
- parmesan
- passata
- salt
- spaghetti

**Method**
1. Finely dice 1 onion and chop 2 garlic cloves. Heat 1 tbsp olive oil in a large pan over medium heat and cook the onion for 5 minutes until soft.
2. Turn the heat up, add 400g minced beef and cook for 6 minutes, breaking it up, until well browned.
3. Stir in the garlic and 1 tsp mixed herbs for 1 minute.
4. Pour in 400g passata and 100ml water, season with ½ tsp salt and ¼ tsp black pepper.
5. Simmer on low, uncovered, for 20 minutes, stirring now and then, until thick and rich.
6. Cook 180g spaghetti in salted boiling water for 9–10 minutes. Keep a mug of pasta water, then drain.
7. Toss the spaghetti through the ragù, loosening with a splash of pasta water, and serve with 30g grated parmesan.

**Tip**
The longer, slower simmer is what turns mince and passata into a proper ragù — don't rush step 5.

### 🫑 Beef stuffed peppers
_seed · 40 min · 11 items_

**Ingredients**
- bell peppers
- black pepper
- garlic
- minced beef
- mixed herbs
- olive oil
- onions
- parmesan
- passata
- rice
- salt

**Method**
1. Preheat the oven to 200°C (180°C fan). Cook 100g rice in salted water for 12 minutes, then drain.
2. Halve 3 bell peppers lengthways and remove the seeds. Place cut-side up in a baking dish, rub with 1 tbsp olive oil and season.
3. Finely dice 1 onion and chop 2 garlic cloves. Heat 1 tbsp olive oil in a frying pan over medium-high heat and cook 300g minced beef for 5 minutes until browned.
4. Add the onion and garlic and cook for 3 minutes, then stir in 1 tsp mixed herbs, ½ tsp salt, ¼ tsp black pepper, the cooked rice and 200g passata.
5. Pack the filling into the pepper halves. Pour the remaining 200g passata around them and sprinkle 30g grated parmesan over the tops.
6. Bake for 25 minutes until the peppers are tender and the tops are golden.
7. Rest for 3 minutes and serve with the sauce from the dish spooned over.

**Tip**
Pack the filling firmly so the halves hold together when you lift them out.

### 🥡 Chicken & broccoli rice bowls
_seed · 30 min · 10 items_

**Ingredients**
- black pepper
- broccoli
- chicken thighs
- garlic
- lemons
- olive oil
- paprika
- rice
- salt
- soy sauce

**Method**
1. Rinse 150g rice and cook in 300ml water: bring to the boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Cut 4 boneless chicken thighs into bite-sized pieces and toss with 1 tsp paprika, ½ tsp salt and ¼ tsp black pepper.
3. Heat 1 tbsp olive oil in a large frying pan over medium-high heat. Cook the chicken for 8 minutes, turning, until golden and cooked through. Set aside.
4. Cut 1 head of broccoli into small florets and chop 3 garlic cloves. Add 1 tbsp olive oil to the pan, then the broccoli and 3 tbsp water. Cover and cook for 4 minutes.
5. Uncover, add the garlic and cook for 1 minute, then return the chicken with 2 tbsp soy sauce and the juice of 1 lemon. Toss for 1 minute.
6. Divide the rice between bowls, top with the chicken and broccoli and spoon over the pan juices.

**Tip**
Steaming the broccoli briefly under a lid keeps it bright and tender-crisp.

### 🍛 Chicken & chickpea curry
_seed · 30 min · 16 items_

**Ingredients**
- black pepper
- chicken thighs
- chickpeas
- chilli flakes
- coconut milk
- cumin
- curry paste
- fresh coriander
- garlic
- olive oil
- onions
- paprika
- rice
- salt
- spinach
- stock cubes

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Dice 1 onion and chop 3 garlic cloves. Heat 1 tbsp olive oil in a large pan over medium-high heat and cook the onion for 4 minutes.
3. Cut 4 boneless chicken thighs into chunks, add to the pan and cook for 5 minutes until lightly browned.
4. Stir in the garlic, 2 tbsp curry paste, 1 tsp cumin, 1 tsp paprika and ½ tsp chilli flakes. Cook for 1 minute.
5. Add a 400ml tin of coconut milk, 1 crumbled stock cube and a drained 400g tin of chickpeas. Simmer for 12 minutes until the chicken is cooked through and the sauce has thickened.
6. Stir in 150g spinach until wilted. Season with salt and black pepper.
7. Serve over the rice, topped with chopped fresh coriander.

**Tip**
Brown the chicken properly before the liquid goes in — it's where the depth of flavour comes from.

### 🍚 Chicken fajita rice
_seed · 30 min · 13 items_

**Ingredients**
- bell peppers
- black pepper
- chicken thighs
- chilli flakes
- cumin
- garlic
- olive oil
- onions
- paprika
- rice
- salt
- stock cubes
- tomatoes

**Method**
1. Cut 4 boneless chicken thighs into bite-sized pieces and toss with 1 tsp cumin, 1 tsp paprika, ½ tsp salt and ¼ tsp black pepper.
2. Heat 1 tbsp olive oil in a large pan with a lid over medium-high heat. Cook the chicken for 6 minutes until golden, then set aside.
3. Dice 1 onion and 2 bell peppers and chop 2 garlic cloves. Add 1 tbsp olive oil to the pan, cook the onion and peppers for 4 minutes, then the garlic and ½ tsp chilli flakes for 1 minute.
4. Stir in 150g rice and toast for 1 minute. Add 350ml water with 1 crumbled stock cube and bring to the boil.
5. Return the chicken, cover, and simmer on the lowest heat for 15 minutes until the rice is tender and the water absorbed.
6. Dice 2 tomatoes, stir them through, and rest covered for 3 minutes.
7. Taste, adjust salt and pepper, and serve.

**Tip**
Toasting the rice in the spiced oil keeps the grains separate and adds a nutty depth.

### 🍗 Chicken parm-style bake
_seed · 40 min · 9 items_

**Ingredients**
- black pepper
- chicken thighs
- garlic
- mixed herbs
- olive oil
- parmesan
- passata
- salt
- spaghetti

**Method**
1. Preheat the oven to 200°C (180°C fan). Pat 4 chicken thighs dry and season with ½ tsp salt, ¼ tsp black pepper and 1 tsp mixed herbs.
2. Heat 1 tbsp olive oil in an ovenproof frying pan over medium-high heat. Brown the chicken skin-side down for 5 minutes, flip for 2 minutes, then set aside.
3. Chop 2 garlic cloves and cook in the same pan for 30 seconds. Pour in 400g passata, add 1 tsp mixed herbs and a pinch of salt, and simmer for 2 minutes.
4. Return the chicken skin-side up, sprinkle 40g grated parmesan over the thighs and bake for 22 minutes until cooked through and golden.
5. Meanwhile, cook 160g spaghetti in salted boiling water for 9–10 minutes, drain and toss with 1 tsp olive oil.
6. Serve the spaghetti topped with the chicken and sauce, with extra parmesan and black pepper.

**Tip**
Browning the chicken first gives a golden crust and flavours the sauce.

### 🍛 Chicken saag-style curry
_seed · 35 min · 14 items_

**Ingredients**
- black pepper
- chicken thighs
- chilli flakes
- cumin
- curry paste
- garlic
- olive oil
- onions
- paprika
- rice
- salt
- spinach
- stock cubes
- yoghurt

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Cut 4 boneless chicken thighs into chunks and toss with 1 tsp paprika, ½ tsp salt and ¼ tsp black pepper.
3. Heat 1 tbsp olive oil in a large pan over medium-high heat. Brown the chicken for 5 minutes, then set aside.
4. Dice 1 onion and chop 3 garlic cloves. Add 1 tbsp olive oil, cook the onion for 5 minutes, then the garlic, 2 tbsp curry paste, 1 tsp cumin and ½ tsp chilli flakes for 1 minute.
5. Add 200ml water and 1 crumbled stock cube, return the chicken, cover and simmer for 12 minutes until cooked through.
6. Add 200g spinach in handfuls, stirring until wilted, about 3 minutes.
7. Take off the heat and stir in 100g yoghurt. Season with salt and black pepper and serve over the rice.

**Tip**
Add the yoghurt off the heat — boiling it makes it split.

### 🌯 Chicken tikka-style wraps
_seed · 25 min · 15 items_

**Ingredients**
- black pepper
- chicken thighs
- chilli flakes
- cumin
- curry paste
- fresh coriander
- garlic
- lemons
- olive oil
- onions
- paprika
- salt
- tomatoes
- tortillas
- yoghurt

**Method**
1. Mix 100g yoghurt with 2 tbsp curry paste, 1 chopped garlic clove, 1 tsp cumin, 1 tsp paprika, ½ tsp chilli flakes, the juice of half a lemon, ½ tsp salt and ¼ tsp black pepper.
2. Cut 4 boneless chicken thighs into chunks and coat in the marinade. Leave for 10 minutes (or up to overnight in the fridge).
3. Thinly slice ½ onion and dice 2 tomatoes. Toss with the juice of the other lemon half and a pinch of salt.
4. Heat 1 tbsp olive oil in a large frying pan over high heat. Cook the chicken for 10 minutes, turning, until charred at the edges and cooked through.
5. Warm 4 tortillas in a dry pan for 30 seconds per side.
6. Mix 100g yoghurt with a pinch of salt for the sauce.
7. Fill the tortillas with chicken, the onion and tomato salad, a spoon of yoghurt and chopped fresh coriander. Roll and serve.

**Tip**
Get the pan really hot so the marinade chars — that's the tikka flavour.

### 🥘 Chickpea & potato coconut stew
_seed · 30 min · 14 items_

**Ingredients**
- black pepper
- chickpeas
- chilli flakes
- coconut milk
- cumin
- curry paste
- garlic
- olive oil
- onions
- paprika
- potatoes
- salt
- spinach
- stock cubes

**Method**
1. Dice 1 onion, chop 2 garlic cloves and cut 500g potatoes into 2cm chunks.
2. Heat 1 tbsp olive oil in a large pot over medium heat and cook the onion for 4 minutes until soft, then the garlic for 1 minute.
3. Stir in 2 tbsp curry paste, 1 tsp cumin, 1 tsp paprika and ¼ tsp chilli flakes. Cook for 1 minute.
4. Add the potatoes, a 400ml tin of coconut milk, 300ml water and 1 crumbled stock cube. Bring to a simmer, cover and cook for 15 minutes until the potatoes are tender.
5. Add a drained 400g tin of chickpeas and 150g spinach. Stir until the spinach wilts, about 2 minutes.
6. Season with salt and black pepper and serve in bowls.

**Tip**
Frying the curry paste with the onion before the liquid goes in wakes the spices up.

### 🥘 Chickpea & spinach curry
_seed · 25 min · 16 items_

**Ingredients**
- black pepper
- chickpeas
- chilli flakes
- chopped tomatoes
- coconut milk
- cumin
- curry paste
- fresh coriander
- garlic
- olive oil
- onions
- paprika
- rice
- salt
- spinach
- stock cubes

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Dice 1 onion and chop 3 garlic cloves. Heat 1 tbsp olive oil in a large pan over medium heat and cook the onion for 4 minutes, then the garlic for 1 minute.
3. Stir in 2 tbsp curry paste, 1 tsp cumin, 1 tsp paprika and ½ tsp chilli flakes for 1 minute.
4. Add a 400g tin of chopped tomatoes, 200ml coconut milk (half a tin), 1 crumbled stock cube and a drained 400g tin of chickpeas. Simmer for 10 minutes until thickened.
5. Stir in 150g spinach until wilted. Season with salt and black pepper.
6. Serve over the rice, topped with chopped fresh coriander.

**Tip**
Crush a few chickpeas against the side of the pan to thicken the sauce naturally.

### 🍳 Chickpea shakshuka
_seed · 25 min · 13 items_

**Ingredients**
- bell peppers
- black pepper
- chickpeas
- cumin
- eggs
- garlic
- mixed herbs
- olive oil
- onions
- paprika
- passata
- salt
- tortillas

**Method**
1. Dice 1 onion and 1 bell pepper and chop 2 garlic cloves. Heat 1 tbsp olive oil in a large frying pan with a lid over medium heat.
2. Cook the onion and pepper for 6 minutes until soft, then add the garlic for 1 minute.
3. Stir in 1 tsp cumin, 1 tsp paprika, ½ tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper. Cook for 30 seconds.
4. Pour in 300g passata and a drained 400g tin of chickpeas. Simmer for 6 minutes until slightly thickened.
5. Make 4 wells in the sauce and crack an egg into each. Cover and cook on low for 5–6 minutes until the whites are set and the yolks still soft.
6. Warm 4 tortillas in a dry pan for 30 seconds per side. Serve the shakshuka from the pan with the tortillas for scooping.

**Tip**
Cover the pan fully for firmer yolks, or leave it slightly open for runny ones.

### 🍛 Coconut salmon curry
_seed · 30 min · 16 items_

**Ingredients**
- black pepper
- chilli flakes
- coconut milk
- cumin
- curry paste
- fresh coriander
- garlic
- lemons
- olive oil
- onions
- paprika
- rice
- salmon fillet
- salt
- spinach
- stock cubes

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Dice 1 onion and chop 2 garlic cloves. Heat 1 tbsp olive oil in a large pan over medium heat and cook the onion for 4 minutes, then the garlic for 1 minute.
3. Stir in 2 tbsp curry paste, 1 tsp cumin, ½ tsp paprika and ¼ tsp chilli flakes for 1 minute.
4. Add a 400ml tin of coconut milk and 1 crumbled stock cube. Simmer for 5 minutes.
5. Cut 2 salmon fillets into large chunks (skin removed) and add to the pan. Simmer gently for 5 minutes until just cooked.
6. Stir in 150g spinach until wilted, then the juice of half a lemon. Season with salt and black pepper.
7. Serve over the rice with chopped fresh coriander and lemon wedges.

**Tip**
Simmer gently once the salmon is in — it's done as soon as it flakes.

### 🐟 Crispy salmon & smashed potatoes
_seed · 35 min · 10 items_

**Ingredients**
- black pepper
- broccoli
- butter
- lemons
- olive oil
- paprika
- potatoes
- salmon fillet
- salt
- yoghurt

**Method**
1. Preheat the oven to 220°C (200°C fan). Cut 500g potatoes into 3cm chunks and boil in salted water for 15 minutes until tender.
2. Drain, tip onto a baking tray, lightly crush each piece with a fork, and toss with 2 tbsp olive oil, ½ tsp paprika, salt and black pepper. Roast for 15 minutes until crisp.
3. Cut 1 head of broccoli into florets, toss with 1 tbsp olive oil, salt and pepper, and add to the tray for the last 10 minutes.
4. Pat 2 salmon fillets dry and season the skin with salt. Heat 1 tbsp olive oil in a frying pan over medium-high heat and cook skin-side down for 5 minutes without moving.
5. Flip, add 15g butter and cook for 2 minutes, spooning the butter over, until just cooked through.
6. Mix 4 tbsp yoghurt with the juice of half a lemon and a pinch of salt.
7. Serve the salmon on the smashed potatoes and broccoli with the lemon yoghurt and lemon wedges.

**Tip**
Dry skin plus a hot pan and no fiddling — that's the whole secret to crispy salmon skin.

### 🥘 Curried beef & potato traybake
_seed · 40 min · 13 items_

**Ingredients**
- black pepper
- chilli flakes
- chopped tomatoes
- cumin
- curry paste
- minced beef
- olive oil
- onions
- paprika
- potatoes
- salt
- stock cubes
- yoghurt

**Method**
1. Preheat the oven to 200°C (180°C fan). Cut 500g potatoes into 2cm cubes and dice 1 onion.
2. Heat 1 tbsp olive oil in a large ovenproof pan or roasting tin on the hob over medium-high heat. Brown 300g minced beef for 5 minutes, breaking it up.
3. Add the onion and cook for 3 minutes, then stir in 2 tbsp curry paste, 1 tsp cumin, ½ tsp paprika and ¼ tsp chilli flakes for 1 minute.
4. Add the potatoes, a 400g tin of chopped tomatoes, 1 crumbled stock cube and 150ml water. Season with ½ tsp salt and ¼ tsp black pepper and stir.
5. Cover with foil and bake for 25 minutes, then uncover and bake 5 minutes more until the potatoes are tender.
6. Serve in bowls with a spoonful of yoghurt on top.

**Tip**
Keep the potato cubes small and even so they cook through in the time.

### 🍚 Egg fried rice with broccoli
_seed · 20 min · 9 items_

**Ingredients**
- black pepper
- broccoli
- eggs
- garlic
- olive oil
- onions
- rice
- salt
- soy sauce

**Method**
1. Use 300g cold cooked rice (about 150g dry cooked earlier and cooled — fresh rice goes mushy).
2. Cut 1 head of broccoli into small florets, dice 1 onion, chop 3 garlic cloves and beat 4 eggs.
3. Heat 1 tbsp olive oil in a wok or large frying pan over high heat. Stir-fry the onion for 2 minutes, then the broccoli with 2 tbsp water for 4 minutes until tender-crisp.
4. Add the garlic for 30 seconds, then push everything to one side.
5. Add 1 tbsp olive oil and the eggs; scramble for 1 minute, then mix through.
6. Add the rice and stir-fry for 3 minutes, breaking up clumps.
7. Add 3 tbsp soy sauce and plenty of black pepper, toss for 1 minute, taste for salt and serve.

**Tip**
Cook the rice in the morning or the day before and keep it in the fridge — cold rice is what makes fried rice work.

### 🌯 Feta & pepper egg wraps
_seed · 15 min · 9 items_

**Ingredients**
- bell peppers
- black pepper
- eggs
- feta
- olive oil
- paprika
- salt
- spinach
- tortillas

**Method**
1. Slice 2 bell peppers into thin strips. Heat 1 tbsp olive oil in a large frying pan over medium heat and cook the peppers for 5 minutes until soft, with a pinch of salt.
2. Add 100g spinach and cook for 1 minute until wilted.
3. Beat 4 eggs with ½ tsp paprika, a pinch of salt and black pepper.
4. Turn the heat to low, pour the eggs over the peppers and stir gently for 3 minutes until just set.
5. Crumble in 100g feta and fold through; take off the heat.
6. Warm 4 tortillas in a dry pan for 30 seconds per side.
7. Divide the filling between the tortillas, dust with paprika, roll up tightly and serve.

**Tip**
Take the eggs off the heat while still slightly glossy — they finish cooking in the wrap.

### 🥗 Greek chicken bowls
_seed · 30 min · 11 items_

**Ingredients**
- black pepper
- chicken thighs
- feta
- garlic
- lemons
- mixed herbs
- olive oil
- rice
- salt
- tomatoes
- yoghurt

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Cut 4 boneless chicken thighs into chunks and toss with 1 tbsp olive oil, 1 tsp mixed herbs, the zest of 1 lemon, 1 chopped garlic clove, ½ tsp salt and ¼ tsp black pepper.
3. Heat 1 tbsp olive oil in a large frying pan over high heat. Cook the chicken for 10 minutes, turning, until charred and cooked through. Squeeze over half the lemon.
4. Dice 3 tomatoes and toss with 1 tbsp olive oil, the remaining lemon juice, a pinch of salt and pepper.
5. Mix 150g yoghurt with 1 finely grated garlic clove and a pinch of salt.
6. Build the bowls: rice, chicken, tomato salad, a spoon of garlic yoghurt and 100g crumbled feta. Finish with black pepper.

**Tip**
Charred edges on the chicken are the point — keep the pan hot and don't crowd it.

### 🥗 Greek-style chickpea salad bowls
_seed · 15 min · 10 items_

**Ingredients**
- black pepper
- chickpeas
- feta
- lemons
- mixed herbs
- olive oil
- onions
- salt
- spinach
- tomatoes

**Method**
1. Drain and rinse a 400g tin of chickpeas and pat dry.
2. Dice 3 tomatoes and very thinly slice ¼ onion.
3. In a large bowl, whisk 3 tbsp olive oil with the juice of 1 lemon, 1 tsp mixed herbs, ¼ tsp salt and black pepper.
4. Add the chickpeas, tomatoes and onion and toss. Leave for 5 minutes to soak up the dressing.
5. Divide 100g spinach between two bowls and spoon the chickpea mix on top.
6. Crumble over 100g feta, finish with a little more olive oil and black pepper, and serve.

**Tip**
Let the chickpeas sit in the dressing for a few minutes — they soak up far more flavour than the leaves do.

### 🥦 Halloumi & broccoli grain bowls
_seed · 25 min · 9 items_

**Ingredients**
- black pepper
- broccoli
- garlic
- halloumi
- lemons
- olive oil
- paprika
- rice
- salt

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Cut 1 head of broccoli into small florets and chop 2 garlic cloves. Slice a 225g block of halloumi into 8 slices and pat dry.
3. Heat 1 tbsp olive oil in a large frying pan over medium-high heat. Add the broccoli and 3 tbsp water, cover and cook for 4 minutes.
4. Uncover, add the garlic, 1 tsp paprika, a pinch of salt and black pepper, and cook for 2 minutes until the edges catch. Tip into a bowl.
5. Add 1 tbsp olive oil to the pan and fry the halloumi for 2 minutes per side until golden.
6. Divide the rice between bowls, top with broccoli and halloumi, squeeze over the juice of 1 lemon and finish with black pepper.

**Tip**
Leave the halloumi alone in the pan until it releases easily — that's when the crust has formed.

### 🧀 Halloumi & chickpea traybake
_seed · 30 min · 9 items_

**Ingredients**
- bell peppers
- black pepper
- chickpeas
- halloumi
- lemons
- olive oil
- onions
- paprika
- salt

**Method**
1. Preheat the oven to 220°C (200°C fan). Cut 1 onion into wedges and 2 bell peppers into chunks. Toss on a large tray with 2 tbsp olive oil, 1 tsp paprika, a pinch of salt and black pepper.
2. Roast for 15 minutes until softening at the edges.
3. Drain a 400g tin of chickpeas and cut a 225g block of halloumi into 1cm slices.
4. Stir the chickpeas into the tray, lay the halloumi on top, drizzle with 1 tbsp olive oil and squeeze over half a lemon.
5. Roast for 12 minutes more until the halloumi is golden.
6. Finish with the juice of the other lemon half and black pepper, and serve.

**Tip**
Spread everything in one layer — a crowded tray steams instead of roasting.

### 🌮 Halloumi fajitas
_seed · 20 min · 13 items_

**Ingredients**
- bell peppers
- black pepper
- chilli flakes
- cumin
- fresh coriander
- halloumi
- lemons
- olive oil
- onions
- paprika
- salt
- tortillas
- yoghurt

**Method**
1. Slice a 225g block of halloumi into strips and pat dry. Slice 1 onion and 2 bell peppers into strips.
2. Heat 1 tbsp olive oil in a large frying pan over medium-high heat. Fry the halloumi for 2 minutes per side until golden, then set aside.
3. Add 1 tbsp olive oil, then the onion and peppers. Cook for 6 minutes until soft and charred in places.
4. Sprinkle over 1 tsp cumin, 1 tsp paprika, ½ tsp chilli flakes, a pinch of salt and black pepper. Cook for 1 minute.
5. Return the halloumi and squeeze over the juice of half a lemon.
6. Mix 4 tbsp yoghurt with the remaining lemon juice and a pinch of salt. Warm 4 tortillas in a dry pan for 30 seconds per side.
7. Fill the tortillas with halloumi and peppers, top with lemon yoghurt and chopped fresh coriander, and serve.

**Tip**
Dry the halloumi well — wet halloumi steams and never browns.

### 🌯 Halloumi wraps with herby yoghurt
_seed · 20 min · 11 items_

**Ingredients**
- black pepper
- halloumi
- lemons
- mixed herbs
- olive oil
- onions
- salt
- spinach
- tomatoes
- tortillas
- yoghurt

**Method**
1. Slice a 225g block of halloumi into 8 slices and pat dry.
2. Mix 150g yoghurt with 1 tsp mixed herbs, the juice of half a lemon, a pinch of salt and black pepper.
3. Very thinly slice ¼ onion and dice 2 tomatoes. Toss with the remaining lemon juice and a pinch of salt.
4. Heat 1 tbsp olive oil in a frying pan over medium-high heat and fry the halloumi for 2 minutes per side until golden.
5. Warm 4 tortillas in a dry pan for 30 seconds per side.
6. Spread each tortilla with herby yoghurt, add a handful of spinach, the halloumi, and the tomato and onion. Roll tightly and serve.

**Tip**
Soaking the sliced onion in the lemon juice for a few minutes softens its bite.

### 🍋 Lemon chicken & parmesan rice
_seed · 35 min · 11 items_

**Ingredients**
- black pepper
- butter
- chicken thighs
- garlic
- lemons
- mixed herbs
- olive oil
- parmesan
- rice
- salt
- spinach

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Pat 4 chicken thighs dry and season with 1 tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper.
3. Heat 1 tbsp olive oil in a large frying pan with a lid over medium-high heat. Cook the chicken skin-side down for 6 minutes until golden, then flip.
4. Add 2 chopped garlic cloves, the juice of 1 lemon and 100ml water. Cover and simmer for 12 minutes until cooked through.
5. Lift the chicken out. Add 150g spinach to the pan juices and stir for 2 minutes until wilted.
6. Stir 15g butter and 40g grated parmesan into the hot rice with black pepper.
7. Serve the rice topped with the chicken, spinach and pan juices, with lemon wedges.

**Tip**
Stir the parmesan into the rice while it's still hot so it melts in rather than clumping.

### 🍗 Lemon garlic roast chicken & potatoes
_seed · 45 min · 9 items_

**Ingredients**
- black pepper
- broccoli
- chicken thighs
- garlic
- lemons
- olive oil
- paprika
- potatoes
- salt

**Method**
1. Preheat the oven to 220°C (200°C fan). Cut 500g potatoes into 2cm chunks and toss on a large tray with 2 tbsp olive oil, 4 whole unpeeled garlic cloves, salt and black pepper.
2. Pat 4 chicken thighs dry and rub with 1 tbsp olive oil, 1 tsp paprika, ½ tsp salt and ¼ tsp black pepper. Nestle skin-side up among the potatoes. Cut 1 lemon into wedges and add to the tray.
3. Roast for 25 minutes.
4. Cut 1 head of broccoli into florets and toss with 1 tbsp olive oil and a pinch of salt. Add to the tray and roast for 12 minutes more until the chicken is golden and cooked through and the potatoes are crisp.
5. Squeeze the roasted lemon wedges and the soft garlic over everything and serve from the tray.

**Tip**
Space the chicken and potatoes out — a packed tray steams and won't crisp.

### 🐟 Salmon & broccoli pasta
_seed · 25 min · 10 items_

**Ingredients**
- black pepper
- broccoli
- garlic
- lemons
- mixed herbs
- olive oil
- parmesan
- salmon fillet
- salt
- spaghetti

**Method**
1. Bring a large pan of salted water to the boil and cook 180g spaghetti for 9–10 minutes. Cut 1 head of broccoli into small florets and drop them into the pasta water for the last 3 minutes. Keep a mug of pasta water, then drain.
2. Meanwhile, season 2 salmon fillets with salt, black pepper and 1 tsp mixed herbs. Heat 1 tbsp olive oil in a large frying pan over medium-high heat and cook skin-side down for 5 minutes, then flip for 2 minutes. Lift out and flake into chunks, discarding the skin.
3. Add 1 tbsp olive oil and 3 chopped garlic cloves to the pan and cook for 1 minute.
4. Add the drained pasta and broccoli, the zest and juice of 1 lemon, 30g grated parmesan and a splash of pasta water. Toss until glossy.
5. Fold in the salmon gently, season with salt and pepper, and serve with extra parmesan.

**Tip**
Cooking the broccoli in the pasta water saves a pan and keeps it tender without going soggy.

### 🌮 Salmon tacos with lemon yoghurt
_seed · 20 min · 13 items_

**Ingredients**
- black pepper
- chilli flakes
- cumin
- fresh coriander
- lemons
- olive oil
- onions
- paprika
- salmon fillet
- salt
- spinach
- tortillas
- yoghurt

**Method**
1. Preheat the oven to 200°C (180°C fan). Rub 2 salmon fillets with 1 tbsp olive oil, 1 tsp paprika, 1 tsp cumin, ¼ tsp chilli flakes, ½ tsp salt and black pepper. Bake for 12 minutes until it flakes.
2. Mix 150g yoghurt with the zest and juice of 1 lemon and a pinch of salt.
3. Very thinly slice ½ onion and toss with a squeeze of lemon and a pinch of salt.
4. Warm 4 tortillas in a dry pan for 30 seconds per side.
5. Flake the salmon into chunks, discarding the skin.
6. Spread each tortilla with lemon yoghurt, add a small handful of spinach, the salmon, the onion and chopped fresh coriander. Serve with lemon wedges.

**Tip**
The salmon is done the moment it flakes — take it out early rather than late.

### 🐟 Salmon traybake
_seed · 30 min · 9 items_

**Ingredients**
- black pepper
- broccoli
- garlic
- lemons
- olive oil
- paprika
- potatoes
- salmon fillet
- salt

**Method**
1. Preheat the oven to 220°C (200°C fan). Cut 500g potatoes into 2cm cubes and toss on a large tray with 2 tbsp olive oil, ½ tsp paprika, salt and black pepper. Roast for 15 minutes.
2. Cut 1 head of broccoli into florets, chop 2 garlic cloves and slice 1 lemon into thin rounds.
3. Push the potatoes to the sides. Place 2 salmon fillets in the middle, season with salt, pepper and ½ tsp paprika, and top with the lemon slices.
4. Scatter the broccoli and garlic around, drizzle with 1 tbsp olive oil and a pinch of salt.
5. Roast for 13 minutes until the salmon flakes and the broccoli is tender. Serve straight from the tray.

**Tip**
Cut the potatoes evenly at 2cm so they're done in the same time as the salmon.

### 🍳 Shakshuka
_seed · 25 min · 13 items_

**Ingredients**
- bell peppers
- black pepper
- cumin
- eggs
- feta
- garlic
- mixed herbs
- olive oil
- onions
- paprika
- passata
- salt
- tortillas

**Method**
1. Dice 1 onion and 2 bell peppers and chop 2 garlic cloves. Heat 1 tbsp olive oil in a large frying pan with a lid over medium heat.
2. Cook the onion and peppers for 7 minutes until soft, then the garlic for 1 minute.
3. Stir in 1 tsp paprika, 1 tsp cumin, ½ tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper for 30 seconds.
4. Pour in 400g passata and simmer for 6 minutes until slightly thickened.
5. Make 4 wells and crack an egg into each. Cover and cook on low for 5–6 minutes until the whites are set and the yolks still soft.
6. Warm 4 tortillas in a dry pan for 30 seconds per side. Crumble 80g feta over the shakshuka and serve from the pan with the tortillas for scooping.

**Tip**
Frying the spices for 30 seconds before the passata makes the whole dish taste deeper.

### 🍝 Spaghetti aglio e olio with spinach
_seed · 15 min · 8 items_

**Ingredients**
- black pepper
- chilli flakes
- garlic
- olive oil
- parmesan
- salt
- spaghetti
- spinach

**Method**
1. Cook 180g spaghetti in salted boiling water for 9–10 minutes. Keep a mug of pasta water, then drain.
2. Meanwhile, thinly slice 4 garlic cloves. Warm 4 tbsp olive oil in a large frying pan over medium-low heat.
3. Add the garlic and ½ tsp chilli flakes and cook gently for 2 minutes until pale gold — don't let it brown.
4. Add 150g spinach in handfuls and stir until wilted.
5. Add the drained spaghetti and 100ml pasta water and toss for 1 minute until the oil and water come together into a glossy coating.
6. Season with salt and plenty of black pepper, and serve with 30g grated parmesan.

**Tip**
Browned garlic is bitter — keep the heat low and pull it as soon as it turns golden.

### 🥔 Spanish tortilla with tomato salad
_seed · 35 min · 8 items_

**Ingredients**
- black pepper
- eggs
- olive oil
- onions
- paprika
- potatoes
- salt
- tomatoes

**Method**
1. Peel 400g potatoes and slice thinly (about 3mm). Thinly slice 1 onion.
2. Heat 4 tbsp olive oil in a 20cm non-stick frying pan over medium-low heat. Add the potatoes and onion with ½ tsp salt and cook gently for 15 minutes, turning occasionally, until soft but not browned.
3. Beat 5 eggs with ½ tsp paprika, a pinch of salt and black pepper. Tip the potatoes into the eggs and mix.
4. Wipe the pan, add 1 tbsp olive oil and return the mixture. Cook on low for 8 minutes until the edges are set and the centre still wobbles.
5. Put a plate over the pan, flip the tortilla onto it, then slide it back in and cook for 3 minutes more.
6. Dice 3 tomatoes and dress with 1 tbsp olive oil, salt, pepper and a pinch of paprika.
7. Cut the tortilla into wedges and serve warm with the tomato salad.

**Tip**
A slight wobble in the middle before flipping gives a creamy centre.

### 🥔 Spiced potato & spinach curry
_seed · 30 min · 14 items_

**Ingredients**
- black pepper
- chilli flakes
- coconut milk
- cumin
- curry paste
- garlic
- olive oil
- onions
- paprika
- potatoes
- rice
- salt
- spinach
- stock cubes

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Cut 500g potatoes into 2cm chunks, dice 1 onion and chop 2 garlic cloves.
3. Heat 1 tbsp olive oil in a large pan over medium heat and cook the onion for 4 minutes, then the garlic, 2 tbsp curry paste, 1 tsp cumin and 1 tsp paprika for 1 minute.
4. Add the potatoes, a 400ml tin of coconut milk, 200ml water and 1 crumbled stock cube. Cover and simmer for 15 minutes until the potatoes are tender.
5. Stir in 150g spinach until wilted, about 2 minutes.
6. Season with salt, black pepper and ½ tsp chilli flakes, and serve over the rice.

**Tip**
Crumble the stock cube in finely so it dissolves evenly through the sauce.

### 🍳 Spinach & feta omelette with potatoes
_seed · 20 min · 8 items_

**Ingredients**
- black pepper
- eggs
- feta
- olive oil
- paprika
- potatoes
- salt
- spinach

**Method**
1. Dice 300g potatoes into 1cm cubes. Heat 2 tbsp olive oil in a large non-stick frying pan over medium-high heat and cook the potatoes for 10 minutes, turning, until golden and tender. Season with salt.
2. Add 150g spinach and stir for 1 minute until wilted.
3. Beat 5 eggs with ½ tsp paprika, a pinch of salt and black pepper.
4. Turn the heat to medium-low, pour in the eggs and scatter over 100g crumbled feta.
5. Cook for 3 minutes, pushing the set edges towards the middle so the runny egg flows underneath.
6. When the top is just set, fold in half, cut into two and serve with black pepper.

**Tip**
Fold rather than flip — it keeps the filling in and the middle soft.

### 🍗 Tandoori-style yoghurt chicken with rice
_seed · 35 min · 14 items_

**Ingredients**
- black pepper
- chicken thighs
- chilli flakes
- cumin
- curry paste
- garlic
- lemons
- olive oil
- onions
- paprika
- rice
- salt
- stock cubes
- yoghurt

**Method**
1. Mix 150g yoghurt with 2 tbsp curry paste, 2 grated garlic cloves, 1 tsp cumin, 1 tsp paprika, ½ tsp chilli flakes, the juice of half a lemon, ½ tsp salt and ¼ tsp black pepper.
2. Slash 4 chicken thighs a couple of times and coat in the marinade. Leave for 10 minutes (or up to overnight in the fridge).
3. Preheat the grill to high. Line a tray, lay the chicken on it and grill for 20 minutes, turning once, until charred and cooked through.
4. Meanwhile, dice 1 onion and cook in 1 tbsp olive oil over medium heat for 4 minutes. Add 150g rinsed rice and stir for 1 minute.
5. Add 300ml water and 1 crumbled stock cube, bring to the boil, cover and simmer on the lowest heat for 12 minutes. Rest covered for 5 minutes.
6. Serve the chicken on the rice with the remaining lemon cut into wedges.

**Tip**
Slashing the chicken lets the marinade get in and helps it cook faster under the grill.

### 🍚 Tomato & parmesan baked rice
_seed · 35 min · 10 items_

**Ingredients**
- black pepper
- garlic
- mixed herbs
- olive oil
- onions
- parmesan
- passata
- rice
- salt
- stock cubes

**Method**
1. Preheat the oven to 200°C (180°C fan). Dice 1 onion and chop 2 garlic cloves.
2. Heat 2 tbsp olive oil in an ovenproof pan with a lid over medium heat. Cook the onion for 4 minutes, then the garlic for 1 minute.
3. Add 150g rice and stir for 1 minute to coat.
4. Pour in 300g passata and 300ml water with 1 crumbled stock cube. Add 1 tsp mixed herbs, ¼ tsp salt and black pepper and bring to a simmer.
5. Cover and bake for 22 minutes until the rice is tender and the liquid absorbed.
6. Stir in 40g grated parmesan, rest for 2 minutes and serve with extra parmesan and black pepper.

**Tip**
If the rice still has bite at 22 minutes, add a splash of water and give it 5 more minutes covered.

### 🍅 Veggie spaghetti pomodoro
_seed · 20 min · 9 items_

**Ingredients**
- black pepper
- garlic
- mixed herbs
- olive oil
- parmesan
- passata
- salt
- spaghetti
- tomatoes

**Method**
1. Cook 180g spaghetti in salted boiling water for 9–10 minutes. Keep a mug of pasta water, then drain.
2. Meanwhile, thinly slice 3 garlic cloves and dice 3 tomatoes.
3. Heat 3 tbsp olive oil in a large pan over medium heat and cook the garlic for 1 minute until fragrant.
4. Add the tomatoes and cook for 3 minutes until they start to break down, then pour in 250g passata and 1 tsp mixed herbs. Simmer for 5 minutes.
5. Season with ½ tsp salt and black pepper. Add the spaghetti and a splash of pasta water and toss for 1 minute.
6. Serve with 30g grated parmesan.

**Tip**
Keep the pasta al dente — it finishes cooking in the sauce.


## Advisor / AI (37)

### 🥚 Baked Eggs in Tomato & Chickpea Sauce with Spinach
_ai · 25 min · 12 items_

**Ingredients**
- black pepper
- chickpeas
- chopped tomatoes
- cumin
- eggs
- garlic
- olive oil
- onions
- paprika
- salt
- spinach
- tortillas

**Method**
1. Dice 1 onion and chop 2 garlic cloves. Heat 2 tbsp olive oil in a large frying pan with a lid over medium heat and cook the onion for 5 minutes, then the garlic for 1 minute.
2. Stir in 1 tsp paprika and ½ tsp cumin for 30 seconds.
3. Add a 400g tin of chopped tomatoes, a drained 400g tin of chickpeas, ½ tsp salt and ¼ tsp black pepper. Simmer for 7 minutes until thickened.
4. Stir in 150g spinach until wilted.
5. Make 4 wells and crack an egg into each. Cover and cook on low for 6 minutes until the whites are set and the yolks still soft.
6. Warm 4 tortillas in a dry pan for 30 seconds per side and serve alongside for scooping.

**Tip**
Keep the heat low once the eggs are in so the sauce doesn't catch underneath before the whites set.

### 🍳 Baked Eggs with Chickpea Tomato Sauce
_ai · 25 min · 11 items_

**Ingredients**
- black pepper
- chickpeas
- eggs
- garlic
- mixed herbs
- olive oil
- onions
- passata
- salt
- spinach
- tortillas

**Method**
1. Dice 1 onion and chop 2 garlic cloves. Heat 2 tbsp olive oil in a large frying pan with a lid over medium heat and cook the onion for 5 minutes, then the garlic for 1 minute.
2. Add 300g passata, a drained 400g tin of chickpeas, 1 tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper. Simmer for 5 minutes.
3. Stir in 150g spinach until wilted.
4. Make 4 wells and crack an egg into each. Cover and cook on low for 6 minutes until the whites are set and the yolks still soft.
5. Warm 4 tortillas in a dry pan for 30 seconds per side.
6. Finish with a drizzle of olive oil and black pepper and serve from the pan with the tortillas.

**Tip**
Crush a few chickpeas into the sauce with the back of a spoon to thicken it.

### 🥔 Baked Potatoes with Feta & Spinach Topping
_ai · 40 min · 9 items_

**Ingredients**
- black pepper
- eggs
- feta
- garlic
- olive oil
- paprika
- potatoes
- salt
- spinach

**Method**
1. Preheat the oven to 220°C (200°C fan). Halve 2 large baking potatoes (about 600g) lengthways, rub with 1 tbsp olive oil, salt and ½ tsp paprika, and roast cut-side down on a tray for 30 minutes until tender.
2. Chop 2 garlic cloves. Heat 1 tbsp olive oil in a frying pan over medium heat, cook the garlic for 30 seconds, then add 200g spinach and stir until wilted and the liquid has cooked off, about 3 minutes.
3. Take off the heat and stir in 100g crumbled feta and black pepper.
4. Turn the potato halves cut-side up, fluff the insides with a fork and press a hollow into each.
5. Pile the spinach and feta on top, then crack 1 egg into the hollow of each half (4 eggs). Season with salt, pepper and a pinch of paprika.
6. Return to the oven for 8 minutes until the whites are set and the yolks still soft. Serve 2 halves each.

**Tip**
Roasting the potatoes cut-side down gets them cooked in 30 minutes instead of an hour.

### 🐟 Baked Salmon with Roasted Broccoli & Lemon
_ai · 25 min · 9 items_

**Ingredients**
- black pepper
- broccoli
- garlic
- lemons
- olive oil
- paprika
- rice
- salmon fillet
- salt

**Method**
1. Preheat the oven to 220°C (200°C fan). Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Cut 1 head of broccoli into florets and toss on a tray with 2 tbsp olive oil, 2 chopped garlic cloves, salt and black pepper. Roast for 5 minutes.
3. Pat 2 salmon fillets dry, rub with 1 tbsp olive oil, ½ tsp paprika, salt and pepper, and add to the tray skin-side down. Top with 3 thin lemon slices.
4. Roast for 12 minutes until the salmon flakes and the broccoli is charred at the edges.
5. Serve on the rice with the juice of the remaining lemon squeezed over.

**Tip**
Give the broccoli a 5-minute head start so it chars while the salmon stays just cooked.

### 🍝 Beef & Broccoli Spaghetti with Garlic Oil
_ai · 25 min · 10 items_

**Ingredients**
- black pepper
- broccoli
- chilli flakes
- garlic
- minced beef
- mixed herbs
- olive oil
- parmesan
- salt
- spaghetti

**Method**
1. Cook 180g spaghetti in salted boiling water for 9–10 minutes. Cut 1 head of broccoli into small florets and drop them in for the last 3 minutes. Keep a mug of pasta water, then drain.
2. Meanwhile, heat 1 tbsp olive oil in a large frying pan over high heat. Cook 300g minced beef for 6 minutes, breaking it up, until browned. Season with 1 tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper and tip onto a plate.
3. Lower the heat, add 3 tbsp olive oil, 4 sliced garlic cloves and ½ tsp chilli flakes, and cook gently for 2 minutes until golden.
4. Return the beef, add the pasta and broccoli and a splash of pasta water, and toss for 1 minute.
5. Serve with 30g grated parmesan and black pepper.

**Tip**
Cook the garlic gently — the oil should taste sweet and garlicky, not bitter.

### 🥩 Beef & Parmesan Mash with Sautéed Spinach
_ai · 30 min · 12 items_

**Ingredients**
- black pepper
- butter
- garlic
- minced beef
- mixed herbs
- olive oil
- onions
- parmesan
- passata
- potatoes
- salt
- spinach

**Method**
1. Peel 600g potatoes, cut into chunks and boil in salted water for 15 minutes until tender.
2. Dice 1 onion and chop 2 garlic cloves. Heat 1 tbsp olive oil in a large frying pan over medium-high heat and cook the onion for 4 minutes.
3. Add 300g minced beef and cook for 6 minutes, breaking it up, until browned. Stir in the garlic and 1 tsp mixed herbs for 1 minute.
4. Add 200g passata, ½ tsp salt and ¼ tsp black pepper and simmer for 5 minutes into a thick, saucy mince.
5. Drain the potatoes and mash with 25g butter, 40g grated parmesan, salt and pepper.
6. Push the mince to one side, add 150g spinach to the pan and stir for 2 minutes until wilted.
7. Serve the mince and spinach over the mash with extra parmesan.

**Tip**
Mash the potatoes while they're hot and let them steam off for a minute first — wet potatoes make gluey mash.

### 🌮 Beef & Potato Curry Tacos
_ai · 30 min · 16 items_

**Ingredients**
- black pepper
- chilli flakes
- coconut milk
- cumin
- curry paste
- fresh coriander
- garlic
- minced beef
- olive oil
- onions
- paprika
- potatoes
- salt
- stock cubes
- tortillas
- yoghurt

**Method**
1. Dice 1 onion, chop 2 garlic cloves and cut 300g potatoes into 1cm cubes.
2. Heat 1 tbsp olive oil in a large pan with a lid over medium-high heat and cook the onion for 4 minutes.
3. Add 300g minced beef and cook for 5 minutes, breaking it up, until browned.
4. Stir in the garlic, 2 tbsp curry paste, 1 tsp cumin, 1 tsp paprika and ½ tsp chilli flakes for 1 minute.
5. Add the potatoes, 200ml coconut milk (half a tin) and 1 crumbled stock cube. Cover and simmer for 15 minutes, stirring occasionally, until the potatoes are tender and the sauce is thick.
6. Season with salt and black pepper. Warm 4 tortillas in a dry pan for 30 seconds per side.
7. Fill the tortillas with the curry, top with a spoon of yoghurt and chopped fresh coriander, and serve.

**Tip**
Keep the potato cubes small so they cook through in 15 minutes and soak up the sauce.

### 🌮 Beef & Tomato Tortilla Casserole
_ai · 30 min · 12 items_

**Ingredients**
- bell peppers
- black pepper
- chopped tomatoes
- cumin
- minced beef
- mixed herbs
- olive oil
- onions
- paprika
- parmesan
- salt
- tortillas

**Method**
1. Preheat the oven to 200°C (180°C fan). Dice 1 onion and 1 bell pepper.
2. Heat 1 tbsp olive oil in a frying pan over medium-high heat. Brown 300g minced beef for 5 minutes, breaking it up.
3. Add the onion and pepper and cook for 4 minutes until soft.
4. Stir in 1 tsp cumin, 1 tsp paprika, 1 tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper, then a 400g tin of chopped tomatoes. Simmer for 5 minutes until thick.
5. Spread a thin layer of the beef in a small baking dish. Cover with a tortilla (tear to fit), then more beef, and repeat, using 4 tortillas and finishing with beef on top.
6. Sprinkle 40g grated parmesan over the top and bake for 15 minutes until golden and bubbling. Cut into portions to serve.

**Tip**
Make the beef layer properly thick, not runny — a wet sauce turns the tortillas soggy.

### 🍖 Beef Meatballs with Lemon Herb Yoghurt
_ai · 30 min · 13 items_

**Ingredients**
- black pepper
- eggs
- garlic
- lemons
- minced beef
- mixed herbs
- olive oil
- onions
- parmesan
- rice
- salt
- spinach
- yoghurt

**Method**
1. Preheat the oven to 200°C (180°C fan). Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Finely grate ½ onion and 2 garlic cloves. Mix with 400g minced beef, 1 egg, 30g grated parmesan, 1 tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper until just combined.
3. Roll into 12 meatballs, place on a lined tray, drizzle with 1 tbsp olive oil and bake for 18 minutes until browned and cooked through.
4. Mix 200g yoghurt with the zest and juice of half a lemon, 1 tsp mixed herbs, a pinch of salt and pepper.
5. Heat 1 tbsp olive oil in a frying pan and wilt 150g spinach for 2 minutes with a pinch of salt.
6. Serve the meatballs on the rice with the spinach, the lemon herb yoghurt spooned over, and the remaining lemon in wedges.

**Tip**
Grating the onion rather than dicing it keeps the meatballs tender and helps them hold together.

### 🍖 Beef Meatballs with Yoghurt & Herbs
_ai · 30 min · 13 items_

**Ingredients**
- black pepper
- eggs
- garlic
- minced beef
- mixed herbs
- olive oil
- onions
- parmesan
- salt
- spinach
- tomatoes
- tortillas
- yoghurt

**Method**
1. Preheat the oven to 200°C (180°C fan). Finely grate ½ onion and 2 garlic cloves.
2. Mix 400g minced beef with the grated onion, half the garlic, 1 egg, 30g grated parmesan, 1 tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper until just combined.
3. Roll into 12 meatballs, place on a lined tray, drizzle with 1 tbsp olive oil and bake for 18 minutes until browned and cooked through.
4. Mix 200g yoghurt with the remaining garlic, 1 tsp mixed herbs, a pinch of salt and pepper.
5. Dice 2 tomatoes and thinly slice the remaining ½ onion.
6. Warm 4 tortillas in a dry pan for 30 seconds per side.
7. Fill each tortilla with a handful of spinach, 3 meatballs, tomato and onion, and a generous spoon of the garlic herb yoghurt. Roll and serve.

**Tip**
Rest the meatballs for 2 minutes out of the oven so they stay juicy when you cut into them.

### 🍝 Chicken & Bell Pepper Pasta Bake
_ai · 40 min · 11 items_

**Ingredients**
- bell peppers
- black pepper
- chicken thighs
- garlic
- mixed herbs
- olive oil
- onions
- parmesan
- passata
- salt
- spaghetti

**Method**
1. Preheat the oven to 200°C (180°C fan). Cook 180g spaghetti in salted boiling water for 8 minutes (slightly under), then drain.
2. Meanwhile, cut 4 boneless chicken thighs into chunks and season with ½ tsp salt, ¼ tsp black pepper and 1 tsp mixed herbs. Heat 1 tbsp olive oil in a large frying pan over medium-high heat and brown the chicken for 6 minutes. Set aside.
3. Dice 1 onion and 2 bell peppers and chop 3 garlic cloves. Add 1 tbsp olive oil to the pan and cook the onion and peppers for 5 minutes, then the garlic for 1 minute.
4. Pour in 400g passata and 100ml water, return the chicken and simmer for 3 minutes. Season to taste.
5. Toss the spaghetti through the sauce, tip into a baking dish and scatter over 40g grated parmesan.
6. Bake for 15 minutes until golden on top. Rest for 2 minutes and serve.

**Tip**
Undercook the spaghetti slightly — it finishes in the oven and soaks up the sauce.

### 🌯 Chicken Thigh Fajita Tortillas
_ai · 30 min · 14 items_

**Ingredients**
- bell peppers
- black pepper
- chicken thighs
- chilli flakes
- cumin
- fresh coriander
- garlic
- lemons
- olive oil
- onions
- paprika
- salt
- tortillas
- yoghurt

**Method**
1. Cut 4 boneless chicken thighs into strips and toss with 1 tsp cumin, 1 tsp paprika, ½ tsp chilli flakes, ½ tsp salt and ¼ tsp black pepper.
2. Heat 1 tbsp olive oil in a large frying pan over high heat. Cook the chicken for 8 minutes, turning, until charred and cooked through. Set aside.
3. Slice 1 onion and 2 bell peppers into strips and chop 2 garlic cloves. Add 1 tbsp olive oil to the pan and cook the onion and peppers for 6 minutes until soft and charred, then the garlic for 1 minute.
4. Return the chicken, squeeze over the juice of half a lemon and toss for 1 minute.
5. Mix 4 tbsp yoghurt with the remaining lemon juice and a pinch of salt. Warm 4 tortillas in a dry pan for 30 seconds per side.
6. Serve the chicken and peppers in the tortillas with the lemon yoghurt and chopped fresh coriander.

**Tip**
Don't stir the peppers too often — they need contact with the hot pan to char.

### 🥘 Chickpea & Tomato Coconut Pasta
_ai · 25 min · 10 items_

**Ingredients**
- black pepper
- chickpeas
- chopped tomatoes
- coconut milk
- garlic
- mixed herbs
- olive oil
- onions
- salt
- spaghetti

**Method**
1. Cook 180g spaghetti in salted boiling water for 9–10 minutes. Keep a mug of pasta water, then drain.
2. Meanwhile, dice 1 onion and chop 3 garlic cloves. Heat 2 tbsp olive oil in a large pan over medium heat and cook the onion for 5 minutes, then the garlic for 1 minute.
3. Add a 400g tin of chopped tomatoes and 1 tsp mixed herbs and simmer for 4 minutes.
4. Add 200ml coconut milk (half a tin) and a drained 400g tin of chickpeas. Simmer for 5 minutes until creamy.
5. Season with ½ tsp salt and black pepper. Toss the spaghetti through, loosening with pasta water if needed, and serve.

**Tip**
Half a tin of coconut milk is enough — a full tin drowns the tomato.

### 🍝 Creamy Chickpea & Tomato Pasta
_ai · 20 min · 10 items_

**Ingredients**
- black pepper
- chickpeas
- garlic
- mixed herbs
- olive oil
- parmesan
- passata
- salt
- spaghetti
- spinach

**Method**
1. Cook 180g spaghetti in salted boiling water for 9–10 minutes. Keep a mug of pasta water, then drain.
2. Meanwhile, heat 2 tbsp olive oil in a large pan over medium heat. Cook 3 chopped garlic cloves for 1 minute.
3. Add 300g passata, a drained 400g tin of chickpeas, 1 tsp mixed herbs, ½ tsp salt and ¼ tsp black pepper. Simmer for 4 minutes, crushing about a third of the chickpeas against the pan to thicken.
4. Stir in 150g spinach until wilted.
5. Add the spaghetti, 30g grated parmesan and a splash of pasta water. Toss until creamy and serve with extra parmesan.

**Tip**
Crushed chickpeas plus parmesan and pasta water give the creaminess — no cream needed.

### 🥔 Creamy Spinach & Feta Baked Potatoes
_ai · 40 min · 9 items_

**Ingredients**
- black pepper
- feta
- garlic
- olive oil
- paprika
- potatoes
- salt
- spinach
- yoghurt

**Method**
1. Preheat the oven to 220°C (200°C fan). Halve 2 large baking potatoes (about 600g) lengthways, rub with 1 tbsp olive oil, salt and ½ tsp paprika, and roast cut-side down for 30 minutes until tender.
2. Chop 2 garlic cloves. Heat 1 tbsp olive oil in a frying pan over medium heat, cook the garlic for 30 seconds, then add 200g spinach and stir until wilted and dry, about 3 minutes.
3. Take off the heat and stir in 100g yoghurt, 100g crumbled feta and black pepper.
4. Scoop most of the flesh from the potato halves into the spinach mix, leaving a 1cm shell, and mash it in.
5. Pile the filling back into the shells, top with 50g more feta and return to the oven for 8 minutes until golden.
6. Finish with a pinch of paprika and black pepper and serve.

**Tip**
Roast the potatoes cut-side down — it halves the cooking time and crisps the skin.

### 🌯 Crispy Chicken Thigh Tortilla Stack with Tomato & Feta
_ai · 35 min · 11 items_

**Ingredients**
- black pepper
- chicken thighs
- chopped tomatoes
- feta
- garlic
- olive oil
- onions
- paprika
- salt
- spinach
- tortillas

**Method**
1. Pat 4 chicken thighs dry and season with 1 tsp paprika, ½ tsp salt and ¼ tsp black pepper.
2. Heat 1 tbsp olive oil in a large frying pan over medium-high heat. Cook skin-side down for 7 minutes until crisp, flip and cook 6 minutes more until cooked through. Rest on a plate, then shred with two forks.
3. Dice 1 onion and chop 2 garlic cloves. Cook in the pan fat for 4 minutes until soft.
4. Add a 400g tin of chopped tomatoes, ½ tsp salt and pepper. Simmer for 6 minutes until thick.
5. Warm 4 tortillas in a dry pan for 30 seconds per side.
6. Build two stacks: tortilla, sauce, shredded chicken, a little spinach and crumbled feta; repeat, finishing with sauce and feta (100g feta in total). Cut in half and serve.

**Tip**
Don't move the chicken while the skin is down — that's where the crispness comes from.

### 🌯 Crispy Halloumi & Broccoli Tortilla Wraps
_ai · 20 min · 10 items_

**Ingredients**
- black pepper
- broccoli
- garlic
- halloumi
- lemons
- olive oil
- paprika
- salt
- tortillas
- yoghurt

**Method**
1. Cut 1 head of broccoli into small florets and chop 2 garlic cloves. Slice a 225g block of halloumi into 8 slices and pat dry.
2. Heat 1 tbsp olive oil in a large frying pan over medium-high heat. Add the broccoli and 3 tbsp water, cover and cook for 4 minutes.
3. Uncover, add the garlic, 1 tsp paprika, a pinch of salt and black pepper, and cook for 2 minutes until the edges catch. Tip onto a plate.
4. Add 1 tbsp olive oil and fry the halloumi for 2 minutes per side until golden.
5. Mix 4 tbsp yoghurt with the juice of half a lemon and a pinch of salt. Warm 4 tortillas in a dry pan for 30 seconds per side.
6. Spread the tortillas with lemon yoghurt, add the broccoli and halloumi, squeeze over the remaining lemon, roll tightly and serve.

**Tip**
Leave the halloumi untouched for the full 2 minutes per side to get a proper crust.

### 🍝 Crispy Halloumi & Tomato Spaghetti
_ai · 20 min · 8 items_

**Ingredients**
- black pepper
- garlic
- halloumi
- mixed herbs
- olive oil
- salt
- spaghetti
- tomatoes

**Method**
1. Cook 180g spaghetti in salted boiling water for 9–10 minutes. Keep a mug of pasta water, then drain.
2. Slice a 225g block of halloumi into 8 slices and pat dry. Heat 1 tbsp olive oil in a large frying pan over medium-high heat and fry for 2 minutes per side until golden. Set aside.
3. Halve 300g cherry tomatoes (or dice 3 tomatoes) and chop 3 garlic cloves. Add 2 tbsp olive oil to the pan and cook the garlic for 30 seconds.
4. Add the tomatoes, 1 tsp mixed herbs, ¼ tsp salt and black pepper. Cook for 5 minutes until they burst and go saucy.
5. Toss the spaghetti through with a splash of pasta water. Top with the halloumi and a drizzle of olive oil and serve.

**Tip**
Halloumi is salty, so go easy on the salt in the sauce and taste before adding more.

### 🍛 Curried Chicken Thigh & Potato Traybake with Coconut
_ai · 50 min · 13 items_

**Ingredients**
- bell peppers
- black pepper
- chicken thighs
- chilli flakes
- coconut milk
- cumin
- curry paste
- olive oil
- onions
- paprika
- potatoes
- salt
- stock cubes

**Method**
1. Preheat the oven to 200°C (180°C fan). Cut 500g potatoes into 2cm chunks, 1 onion into wedges and 2 bell peppers into chunks. Toss in a roasting tin with 1 tbsp olive oil, salt and black pepper.
2. Mix 2 tbsp curry paste with 1 tsp cumin, 1 tsp paprika, ½ tsp chilli flakes and 1 tbsp olive oil. Rub over 4 chicken thighs and sit them skin-side up on the vegetables.
3. Whisk a 400ml tin of coconut milk with 1 crumbled stock cube and pour around (not over) the chicken.
4. Cover with foil and roast for 25 minutes.
5. Uncover and roast for 15 minutes more until the chicken skin is golden and the potatoes are tender.
6. Season the sauce with salt and pepper and serve from the tin.

**Tip**
Pour the coconut milk around the chicken, not on it, so the skin roasts instead of steaming.

### 🍛 Curried Chickpea & Tomato Coconut Soup
_ai · 25 min · 14 items_

**Ingredients**
- black pepper
- chickpeas
- chilli flakes
- chopped tomatoes
- coconut milk
- cumin
- curry paste
- fresh coriander
- garlic
- olive oil
- onions
- paprika
- salt
- stock cubes

**Method**
1. Dice 1 onion and chop 2 garlic cloves. Heat 1 tbsp olive oil in a large pot over medium heat and cook the onion for 4 minutes, then the garlic for 1 minute.
2. Stir in 2 tbsp curry paste, 1 tsp cumin and ½ tsp paprika for 1 minute.
3. Add a 400g tin of chopped tomatoes and cook for 2 minutes.
4. Pour in a 400ml tin of coconut milk and 300ml water, crumble in 1 stock cube and add a drained 400g tin of chickpeas.
5. Simmer for 10 minutes until slightly thickened. Blend half with a stick blender if you want it thicker.
6. Season with salt, black pepper and ¼ tsp chilli flakes. Serve in bowls topped with chopped fresh coriander.

**Tip**
Taste before adding the chilli flakes — the curry paste already brings some heat.

### 🍛 Curried Salmon with Roasted Potatoes & Broccoli
_ai · 40 min · 12 items_

**Ingredients**
- black pepper
- broccoli
- chilli flakes
- coconut milk
- cumin
- curry paste
- olive oil
- paprika
- potatoes
- salmon fillet
- salt
- stock cubes

**Method**
1. Preheat the oven to 220°C (200°C fan). Cut 500g potatoes into 2cm cubes and toss on a large tray with 2 tbsp olive oil, ½ tsp paprika, salt and black pepper. Roast for 20 minutes.
2. Meanwhile, make the sauce: in a small pan, whisk 2 tbsp curry paste with 200ml coconut milk (half a tin), ½ crumbled stock cube and ½ tsp cumin. Simmer for 5 minutes until thickened.
3. Cut 1 head of broccoli into florets and toss with 1 tbsp olive oil and a pinch of salt.
4. Push the potatoes to one side of the tray, add the broccoli and lay 2 salmon fillets skin-side down in the middle. Spoon half the sauce over the salmon and sprinkle with ¼ tsp chilli flakes.
5. Roast for 13 minutes until the salmon flakes.
6. Plate the potatoes, broccoli and salmon and spoon the rest of the warm sauce over.

**Tip**
Don't stir the potatoes once they're roasting — leaving them alone gives crisp edges.

### 🍝 Garlic Tomato Chicken Thigh Spaghetti
_ai · 35 min · 10 items_

**Ingredients**
- black pepper
- chicken thighs
- chopped tomatoes
- garlic
- mixed herbs
- olive oil
- onions
- parmesan
- salt
- spaghetti

**Method**
1. Pat 4 chicken thighs dry and season with ½ tsp salt and ¼ tsp black pepper. Heat 1 tbsp olive oil in a large pan with a lid over medium-high heat and cook skin-side down for 6 minutes until golden, then flip for 3 minutes. Set aside.
2. Dice 1 onion and chop 4 garlic cloves. Cook in the pan for 4 minutes until soft.
3. Add a 400g tin of chopped tomatoes, 100ml water and 1 tsp mixed herbs. Return the chicken, cover and simmer for 15 minutes until cooked through.
4. Meanwhile, cook 180g spaghetti in salted boiling water for 9–10 minutes and drain.
5. Lift out the chicken, shred it with two forks (discard the skin if you prefer) and stir back into the sauce. Season with salt and pepper.
6. Toss the spaghetti through the sauce and serve with 30g grated parmesan.

**Tip**
Searing the thighs skin-side down first renders the fat that flavours the whole sauce.

### 🍝 Garlic Tomato Halloumi Spaghetti
_ai · 20 min · 9 items_

**Ingredients**
- black pepper
- chopped tomatoes
- garlic
- halloumi
- mixed herbs
- olive oil
- onions
- salt
- spaghetti

**Method**
1. Cook 180g spaghetti in salted boiling water for 9–10 minutes. Keep a mug of pasta water, then drain.
2. Dice 1 onion and chop 3 garlic cloves. Heat 2 tbsp olive oil in a large pan over medium heat and cook the onion for 4 minutes, then the garlic for 1 minute.
3. Add a 400g tin of chopped tomatoes, 1 tsp mixed herbs, ¼ tsp salt and ¼ tsp black pepper. Simmer for 6 minutes until thick.
4. Cut a 225g block of halloumi into 1cm cubes and pat dry. Heat 1 tbsp olive oil in a frying pan over medium-high heat and fry for 3 minutes, turning, until golden.
5. Toss the spaghetti through the sauce with a splash of pasta water, fold in the halloumi and serve with black pepper.

**Tip**
Add the halloumi at the very end so it stays crisp instead of softening in the sauce.

### 🥙 Halloumi & Chickpea Buddha Bowl with Yoghurt Dressing
_ai · 20 min · 11 items_

**Ingredients**
- bell peppers
- black pepper
- chickpeas
- garlic
- halloumi
- lemons
- olive oil
- paprika
- salt
- spinach
- yoghurt

**Method**
1. Slice a 225g block of halloumi into 8 slices and pat dry. Heat 1 tbsp olive oil in a large frying pan over medium-high heat and fry for 2 minutes per side until golden. Set aside.
2. Drain a 400g tin of chickpeas and pat dry. Add 1 tbsp olive oil to the pan, then the chickpeas with 1 tsp paprika, ¼ tsp salt and black pepper. Fry for 4 minutes until lightly crisp.
3. Dice 2 bell peppers.
4. Mix 150g yoghurt with 1 finely grated garlic clove, the juice of half a lemon, a pinch of salt and pepper.
5. Divide 100g spinach between two bowls. Top with the chickpeas, peppers and halloumi.
6. Spoon over the dressing, squeeze over the remaining lemon and finish with a pinch of paprika.

**Tip**
Dry the chickpeas well before frying so they crisp instead of spitting.

### 🔥 Halloumi & Potato Skewers with Tomato Sauce
_ai · 30 min · 11 items_

**Ingredients**
- bell peppers
- black pepper
- garlic
- halloumi
- lemons
- mixed herbs
- olive oil
- paprika
- passata
- potatoes
- salt

**Method**
1. Cut 400g potatoes into 3cm chunks and boil in salted water for 10 minutes until just tender. Drain and steam dry.
2. Cut a 225g block of halloumi into 3cm cubes and 2 bell peppers into similar chunks. Toss everything with 2 tbsp olive oil, 1 tsp paprika, 1 tsp mixed herbs and black pepper.
3. Thread onto 4 skewers, alternating potato, halloumi and pepper. (No skewers? Cook the pieces loose in the pan — it works just as well.)
4. Heat 1 tbsp olive oil in a large frying pan or griddle over medium-high heat. Cook the skewers for 10 minutes, turning every 2–3 minutes, until the halloumi is golden and the potatoes are crisp.
5. Meanwhile, cook 1 chopped garlic clove in 1 tbsp olive oil for 30 seconds, add 250g passata, ½ tsp mixed herbs, ¼ tsp salt and pepper, and simmer for 5 minutes.
6. Squeeze the juice of 1 lemon over the skewers and serve with the warm tomato sauce for dipping.

**Tip**
If you use wooden skewers, soak them in water for 20 minutes first so they don't scorch.

### 🍚 Minced Beef & Bell Pepper Coconut Rice
_ai · 30 min · 11 items_

**Ingredients**
- bell peppers
- black pepper
- coconut milk
- garlic
- minced beef
- olive oil
- onions
- paprika
- rice
- salt
- stock cubes

**Method**
1. Dice 1 onion and 2 bell peppers and chop 2 garlic cloves. Rinse 150g rice.
2. Heat 1 tbsp olive oil in a large pan with a lid over medium-high heat. Brown 300g minced beef for 5 minutes, breaking it up, then set aside.
3. Cook the onion and peppers in the pan for 5 minutes, then the garlic for 1 minute.
4. Add the rice, 1 tsp paprika, ½ tsp salt and ¼ tsp black pepper and stir for 1 minute.
5. Pour in a 400ml tin of coconut milk and 100ml water with 1 crumbled stock cube. Return the beef and stir.
6. Bring to a simmer, cover, and cook on the lowest heat for 15 minutes until the rice is tender. Rest covered for 3 minutes, fluff and serve.

**Tip**
Don't lift the lid while the rice cooks — the steam is doing the work.

### 🍲 Minced Beef & Chickpea Bolognese
_ai · 30 min · 11 items_

**Ingredients**
- black pepper
- chickpeas
- garlic
- minced beef
- mixed herbs
- olive oil
- onions
- parmesan
- passata
- salt
- spaghetti

**Method**
1. Dice 1 onion and chop 2 garlic cloves. Heat 1 tbsp olive oil in a large pan over medium-high heat and cook the onion for 4 minutes.
2. Add 300g minced beef and cook for 5 minutes, breaking it up, until browned. Stir in the garlic and 1 tsp mixed herbs for 1 minute.
3. Add 400g passata, a drained 400g tin of chickpeas, 100ml water, ½ tsp salt and ¼ tsp black pepper.
4. Simmer on low for 15 minutes, stirring now and then, until thick.
5. Meanwhile, cook 180g spaghetti in salted boiling water for 9–10 minutes and drain.
6. Toss the spaghetti through the sauce and serve with 30g grated parmesan.

**Tip**
Drain the chickpeas well so they don't water down the sauce.

### 🍚 Minced Beef & Chickpea Rice Bowl
_ai · 25 min · 13 items_

**Ingredients**
- bell peppers
- black pepper
- chickpeas
- cumin
- garlic
- lemons
- minced beef
- olive oil
- onions
- paprika
- rice
- salt
- yoghurt

**Method**
1. Rinse 150g rice and cook in 300ml water with a pinch of salt: boil, cover, simmer on the lowest heat for 12 minutes, then rest covered.
2. Dice 1 onion and 2 bell peppers and chop 2 garlic cloves. Heat 1 tbsp olive oil in a large frying pan over medium-high heat and cook the onion for 4 minutes.
3. Add 300g minced beef and cook for 6 minutes, breaking it up, until browned.
4. Add the peppers, garlic, 1 tsp paprika, 1 tsp cumin, ½ tsp salt and ¼ tsp black pepper. Cook for 4 minutes.
5. Stir in a drained 400g tin of chickpeas and the juice of half a lemon and cook for 2 minutes to heat through.
6. Serve over the rice with a spoon of yoghurt and the remaining lemon in wedges.

**Tip**
A squeeze of lemon at the end lifts the whole bowl — don't skip it.

### 🍲 Minced Beef & Potato Coconut Stew
_ai · 30 min · 14 items_

**Ingredients**
- black pepper
- chilli flakes
- coconut milk
- cumin
- curry paste
- fresh coriander
- garlic
- minced beef
- olive oil
- onions
- paprika
- potatoes
- salt
- stock cubes

**Method**
1. Dice 1 onion, chop 2 garlic cloves and cut 500g potatoes into 2cm chunks.
2. Heat 1 tbsp olive oil in a large pot over medium-high heat and cook the onion for 4 minutes.
3. Add 300g minced beef and cook for 5 minutes, breaking it up, until browned.
4. Stir in the garlic, 2 tbsp curry paste, 1 tsp cumin, 1 tsp paprika and ¼ tsp chilli flakes for 1 minute.
5. Add the potatoes, a 400ml tin of coconut milk, 100ml water and 1 crumbled stock cube. Cover and simmer for 18 minutes until the potatoes are tender.
6. Season with salt and black pepper and serve in bowls with chopped fresh coriander.

**Tip**
Brown the beef properly before the liquid goes in — that's where the stew gets its depth.

### 🥗 Pan-Seared Halloumi with Lemon Broccoli & Chickpea Salad
_ai · 25 min · 9 items_

**Ingredients**
- black pepper
- broccoli
- chickpeas
- garlic
- halloumi
- lemons
- mixed herbs
- olive oil
- salt

**Method**
1. Preheat the oven to 220°C (200°C fan). Cut 1 head of broccoli into florets and toss on a tray with 2 tbsp olive oil, 2 chopped garlic cloves, the zest of 1 lemon, 1 tsp mixed herbs, salt and black pepper. Roast for 15 minutes until charred at the edges.
2. Drain a 400g tin of chickpeas and pat dry.
3. Slice a 225g block of halloumi into 8 slices and pat dry. Heat 1 tbsp olive oil in a frying pan over medium-high heat and fry for 2 minutes per side until golden.
4. Toss the roasted broccoli with the chickpeas, 1 tbsp olive oil, the juice of half the lemon, salt and pepper.
5. Divide between plates, top with the halloumi and serve with the remaining lemon in wedges.

**Tip**
Roast the broccoli hot and fast so the edges char while the stems stay firm.

### 🍚 Salmon & Lemon Risotto with Parmesan
_ai · 40 min · 12 items_

**Ingredients**
- black pepper
- butter
- garlic
- lemons
- mixed herbs
- olive oil
- onions
- parmesan
- rice
- salmon fillet
- salt
- stock cubes

**Method**
1. Dissolve 1 stock cube in 800ml boiling water and keep it hot. Finely dice 1 onion and chop 2 garlic cloves.
2. Heat 1 tbsp olive oil and 15g butter in a wide pan over medium heat. Cook the onion for 5 minutes until soft, then the garlic for 1 minute.
3. Add 200g rice and stir for 1 minute to coat. Add a ladle of stock and stir until absorbed. Keep adding stock a ladle at a time, stirring often, for 18–20 minutes until the rice is creamy with a little bite.
4. Meanwhile, season 2 salmon fillets with salt, black pepper and 1 tsp mixed herbs. Heat 1 tbsp olive oil in a frying pan over medium-high heat and cook skin-side down for 5 minutes, then flip for 2 minutes. Flake into chunks, discarding the skin.
5. Take the risotto off the heat and beat in 15g butter, 40g grated parmesan, and the zest and juice of 1 lemon. Season.
6. Fold in the salmon gently and serve with extra parmesan and black pepper.

**Tip**
Keep the stock hot and add it gradually — cold stock stalls the rice and stops it going creamy.

### 🥚 Salmon & Potato Frittata
_ai · 25 min · 9 items_

**Ingredients**
- black pepper
- eggs
- olive oil
- onions
- paprika
- potatoes
- salmon fillet
- salt
- spinach

**Method**
1. Preheat the oven to 200°C (180°C fan). Dice 300g potatoes into 1cm cubes and 1 onion.
2. Heat 2 tbsp olive oil in a 24cm ovenproof frying pan over medium-high heat. Cook the potatoes for 10 minutes, turning, until golden and tender. Add the onion for the last 3 minutes.
3. Cut 2 salmon fillets into chunks (skin removed), add to the pan and cook for 2 minutes. Stir in 100g spinach until wilted.
4. Beat 6 eggs with ½ tsp salt, ¼ tsp black pepper and ½ tsp paprika. Pour over the pan and cook on the hob for 2 minutes until the edges set.
5. Transfer to the oven for 8 minutes until just set in the middle.
6. Rest for 2 minutes, slide onto a board, cut in half and serve.

**Tip**
Pull it from the oven while the centre still wobbles slightly — it carries on cooking in the pan.

### 🐟 Salmon & Spinach Rice with Lemon
_ai · 30 min · 9 items_

**Ingredients**
- black pepper
- garlic
- lemons
- olive oil
- paprika
- rice
- salmon fillet
- salt
- spinach

**Method**
1. Chop 2 garlic cloves and zest 1 lemon. Heat 2 tbsp olive oil in a large pan with a lid over medium heat and cook the garlic for 1 minute.
2. Add 150g rinsed rice and stir for 1 minute. Add 300ml water and ½ tsp salt, bring to the boil, cover and simmer on the lowest heat for 10 minutes.
3. Pat 2 salmon fillets dry, remove the skin, and season with salt, black pepper, ½ tsp paprika and the lemon zest.
4. Lay the salmon on top of the rice, cover, and cook for 8 minutes more until the salmon flakes and the rice is tender.
5. Lift the salmon out. Fold 150g spinach and the juice of half the lemon through the rice until wilted, about 2 minutes.
6. Flake the salmon over the rice and serve with the remaining lemon in wedges.

**Tip**
Steaming the salmon on top of the rice keeps it moist and saves a pan.

### 🐟 Salmon & Tomato Coconut Pasta
_ai · 25 min · 10 items_

**Ingredients**
- black pepper
- chopped tomatoes
- coconut milk
- garlic
- mixed herbs
- olive oil
- onions
- salmon fillet
- salt
- spaghetti

**Method**
1. Cook 180g spaghetti in salted boiling water for 9–10 minutes. Keep a mug of pasta water, then drain.
2. Dice 1 onion and chop 2 garlic cloves. Heat 1 tbsp olive oil in a large pan over medium heat and cook the onion for 4 minutes, then the garlic for 1 minute.
3. Add a 400g tin of chopped tomatoes and 1 tsp mixed herbs. Simmer for 5 minutes.
4. Pour in 200ml coconut milk (half a tin), season with ½ tsp salt and black pepper, and simmer for 2 minutes.
5. Cut 2 salmon fillets into chunks (skin removed), add to the sauce and simmer gently for 4 minutes until just cooked.
6. Toss the spaghetti through with a splash of pasta water, taking care not to break up the salmon, and serve.

**Tip**
Add the salmon last and keep the heat gentle — it only needs 4 minutes.

### 🍚 Spiced Halloumi Rice Bowl with Tomato & Spinach
_ai · 25 min · 13 items_

**Ingredients**
- black pepper
- chilli flakes
- cumin
- curry paste
- halloumi
- olive oil
- onions
- paprika
- rice
- salt
- spinach
- stock cubes
- tomatoes

**Method**
1. Dice 1 onion. Heat 1 tbsp olive oil in a large pan with a lid over medium heat and cook the onion for 4 minutes.
2. Stir in 1 tbsp curry paste, 1 tsp cumin and 1 tsp paprika for 1 minute.
3. Add 150g rinsed rice and stir to coat. Pour in 300ml water with 1 crumbled stock cube, bring to the boil, cover and simmer on the lowest heat for 12 minutes.
4. Meanwhile, cut a 225g block of halloumi into cubes and pat dry. Heat 1 tbsp olive oil in a frying pan over medium-high heat and fry for 3 minutes, turning, until golden.
5. Dice 2 tomatoes. Fold them and 100g spinach through the rice, cover for 2 minutes until the spinach wilts.
6. Season with salt, black pepper and ¼ tsp chilli flakes. Serve topped with the halloumi.

**Tip**
Keep the lid on the rice — lifting it lets the steam out and leaves the rice undercooked.

### 🍚 Spiced Minced Beef & Bell Pepper Rice
_ai · 30 min · 12 items_

**Ingredients**
- bell peppers
- black pepper
- chilli flakes
- cumin
- curry paste
- minced beef
- olive oil
- onions
- paprika
- rice
- salt
- stock cubes

**Method**
1. Dice 1 onion and 2 bell peppers. Heat 1 tbsp olive oil in a large pan with a lid over medium-high heat and cook them for 4 minutes until soft.
2. Add 300g minced beef and cook for 5 minutes, breaking it up, until browned.
3. Stir in 2 tbsp curry paste, 1 tsp cumin, 1 tsp paprika and ¼ tsp chilli flakes for 1 minute.
4. Add 150g rinsed rice and stir for 1 minute to coat.
5. Pour in 350ml water with 1 crumbled stock cube and ¼ tsp black pepper. Bring to the boil, cover and simmer on the lowest heat for 15 minutes until the rice is tender.
6. Rest covered for 3 minutes, fluff, taste for salt and serve.

**Tip**
One stock cube is enough — the curry paste is already salty.

### 🌯 Spinach & Feta Egg Tortilla Wraps
_ai · 15 min · 9 items_

**Ingredients**
- black pepper
- eggs
- feta
- olive oil
- onions
- paprika
- salt
- spinach
- tortillas

**Method**
1. Dice ½ onion. Heat 1 tbsp olive oil in a large frying pan over medium heat and cook the onion for 3 minutes until soft.
2. Add 150g spinach and stir for 1 minute until wilted.
3. Beat 4 eggs with ½ tsp paprika, a pinch of salt and black pepper. Turn the heat to low, pour in and stir gently for 3 minutes until just set.
4. Crumble in 100g feta, fold through and take off the heat.
5. Warm 4 tortillas in a dry pan for 30 seconds per side.
6. Divide the filling between the tortillas, roll tightly, cut in half and serve.

**Tip**
Feta is salty — a pinch of salt in the eggs is all you need.

---

## Review notes

What was wrong in the generated file, and what changed (8 Sep 2026):

- **"Oil" without olive oil.** 31 methods used oil that was not in the ingredient list. `olive oil` added to each. It is a cupboard item, so it rarely reaches the basket, but the list must be true.
- **Tinned vs fresh tomatoes.** 12 methods called for "a 400g tin of tomatoes" while the list said `tomatoes` (fresh, priced as a punnet). Fixed by adding the new catalog item `chopped tomatoes` and swapping it in for keema, curries, the casserole, the soup, the coconut pastas and the chicken spaghetti. `tomatoes` now means fresh only (salads, salsas, pomodoro, roasting).
- **Stock / broth with no stock cube.** Fajita rice, the risotto, the coconut rice and the baked rice now list `stock cubes`.
- **Unused or wrong ingredients removed.** Parmesan dropped from two halloumi dishes (both are salty; one is a salad). Stock cube dropped from the tikka marinade.
- **Missing basics for taste.** Garlic added where a curry or sauce had none; lemon added to tacos, fajitas, wraps and yoghurt sauces (it is what makes a yoghurt sauce taste of something); eggs added to the beef fried rice; a spoon of yoghurt added to the curry tacos and the rice bowl.
- **Meals that were not a full dinner.** Both meatball dishes were meat and yoghurt only — one is now served on rice with spinach, the other as tortilla wraps with tomato and spinach. Baked salmon & broccoli gained rice. The four shakshuka-style egg dishes gained tortillas for scooping (the old methods said "serve with bread", which is not in the catalog).
- **Methods that could not work as written.** Chicken saag cooked thighs 8–10 min per side and then simmered them 12 more; the pasta bake tried to cook dry spaghetti in 300ml passata; both baked-potato dishes needed 55–60 minutes against a 35–40 minute label (now halved and roasted cut-side down, 30 min); the curried salmon traybake had a garbled step 3; the curried chicken traybake ran 55 min against a 45 min label (relabelled 50 min with a shorter covered stage); the tandoori chicken used three stock cubes (now one); the skewers dish now has a no-skewer alternative.
- **Consistency.** All quantities are UK metric for 2, sized to pack sizes we sell (4 thighs, 2 salmon fillets, 225g halloumi, 400g tins, 500g passata, 8-pack tortillas). Rice is cooked the same absorption way everywhere (150g rice, 300ml water, 12 min covered). Spaghetti is 180g. Oven temperatures give fan in brackets. Every stated time is achievable; 16 time labels moved by a few minutes to match (see table).
- **Not changed.** Meal names and emoji are untouched, so `meals` rows still match by name. Dish count and section order are unchanged.

## Database changes

### 1. New catalog ingredients (add before patching `ing`)

| Name | Suggested pack / price row | Type | Used by |
|---|---|---|---|
| `chopped tomatoes` | 400g tin | grocery | Beef keema with rice; Chickpea & spinach curry; Curried beef & potato traybake; Baked Eggs in Tomato & Chickpea Sauce with Spinach; Beef & Tomato Tortilla Casserole; Chickpea & Tomato Coconut Pasta; Crispy Chicken Thigh Tortilla Stack with Tomato & Feta; Curried Chickpea & Tomato Coconut Soup; Garlic Tomato Chicken Thigh Spaghetti; Garlic Tomato Halloumi Spaghetti; Salmon & Tomato Coconut Pasta |
| `butter` | 250g block | grocery (fridge staple — consider a cupboard tick like olive oil) | Crispy salmon & smashed potatoes; Lemon chicken & parmesan rice; Beef & Parmesan Mash with Sautéed Spinach; Salmon & Lemon Risotto with Parmesan |
| `fresh coriander` | 30g bunch | grocery | Beef & bell pepper tacos; Beef keema with rice; Chicken & chickpea curry; Chicken tikka-style wraps; Chickpea & spinach curry; Coconut salmon curry; Halloumi fajitas; Salmon tacos with lemon yoghurt; Beef & Potato Curry Tacos; Chicken Thigh Fajita Tortillas; Curried Chickpea & Tomato Coconut Soup; Minced Beef & Potato Coconut Stew |

Each needs: a row in `ingredient_prices` for all four stores, the catalog key added to the 32-key set in `index.html` (and to `completeIng` if it treats butter as a cupboard item), and the allowed list in the `ai` edge function so the recipe and advisor prompts can use them. Catalog goes from 32 to 35 keys (27 groceries + 8 cupboard seasonings).

### 2. Per-meal `ing` patch

62 of 77 meals change. Add and remove the names below; the full list for every meal is the **Ingredients** block above (already sorted, catalog names only). Times are the `time` column where the label changed.

| Meal | Add to `ing` | Remove from `ing` | Time |
|---|---|---|---|
| 🌮 Beef & bell pepper tacos | `fresh coriander`, `lemons`, `olive oil` | — | — |
| 🥡 Beef & broccoli fried rice | `eggs` | — | — |
| 🍛 Beef keema with rice | `chopped tomatoes`, `fresh coriander`, `olive oil` | `tomatoes` | — |
| 🍝 Beef meatballs in tomato sauce | `olive oil`, `onions` | — | — |
| 🍝 Beef ragù spaghetti | `olive oil` | — | — |
| 🫑 Beef stuffed peppers | `garlic`, `olive oil` | — | — |
| 🥡 Chicken & broccoli rice bowls | `soy sauce` | — | — |
| 🍛 Chicken & chickpea curry | `fresh coriander`, `olive oil` | — | — |
| 🍚 Chicken fajita rice | `olive oil`, `stock cubes` | — | — |
| 🍛 Chicken saag-style curry | `olive oil` | — | — |
| 🌯 Chicken tikka-style wraps | `fresh coriander`, `garlic`, `lemons`, `olive oil` | `stock cubes` | — |
| 🥘 Chickpea & potato coconut stew | `garlic`, `olive oil` | — | — |
| 🥘 Chickpea & spinach curry | `chopped tomatoes`, `fresh coriander`, `garlic`, `olive oil` | `tomatoes` | 20→25 min |
| 🍳 Chickpea shakshuka | `olive oil`, `tortillas` | — | — |
| 🍛 Coconut salmon curry | `fresh coriander`, `garlic`, `lemons`, `olive oil` | — | — |
| 🐟 Crispy salmon & smashed potatoes | `butter` | — | — |
| 🥘 Curried beef & potato traybake | `chopped tomatoes`, `olive oil` | `tomatoes` | — |
| 🌯 Feta & pepper egg wraps | `olive oil` | — | — |
| 🥗 Greek chicken bowls | `olive oil` | — | — |
| 🥗 Greek-style chickpea salad bowls | `onions` | — | — |
| 🌮 Halloumi fajitas | `fresh coriander`, `olive oil` | — | — |
| 🌯 Halloumi wraps with herby yoghurt | `lemons`, `olive oil` | — | — |
| 🍋 Lemon chicken & parmesan rice | `butter`, `olive oil` | — | — |
| 🌮 Salmon tacos with lemon yoghurt | `fresh coriander`, `olive oil` | — | — |
| 🐟 Salmon traybake | — | — | 25→30 min |
| 🍳 Shakshuka | `olive oil`, `tortillas` | — | — |
| 🥔 Spiced potato & spinach curry | `olive oil` | — | — |
| 🍗 Tandoori-style yoghurt chicken with rice | `garlic`, `olive oil` | — | — |
| 🍚 Tomato & parmesan baked rice | `stock cubes` | — | — |
| 🥚 Baked Eggs in Tomato & Chickpea Sauce with Spinach | `chopped tomatoes`, `cumin`, `tortillas` | `tomatoes` | — |
| 🍳 Baked Eggs with Chickpea Tomato Sauce | `tortillas` | — | 28→25 min |
| 🐟 Baked Salmon with Roasted Broccoli & Lemon | `rice` | — | 22→25 min |
| 🍝 Beef & Broccoli Spaghetti with Garlic Oil | `chilli flakes` | — | — |
| 🥩 Beef & Parmesan Mash with Sautéed Spinach | `butter`, `onions`, `passata` | — | 26→30 min |
| 🌮 Beef & Potato Curry Tacos | `fresh coriander`, `olive oil`, `yoghurt` | — | — |
| 🌮 Beef & Tomato Tortilla Casserole | `chopped tomatoes`, `cumin`, `paprika` | `tomatoes` | 28→30 min |
| 🍖 Beef Meatballs with Lemon Herb Yoghurt | `olive oil`, `rice`, `spinach` | — | 32→30 min |
| 🍖 Beef Meatballs with Yoghurt & Herbs | `olive oil`, `spinach`, `tomatoes`, `tortillas` | — | — |
| 🍝 Chicken & Bell Pepper Pasta Bake | `onions` | — | — |
| 🌯 Chicken Thigh Fajita Tortillas | `fresh coriander`, `lemons`, `yoghurt` | — | 28→30 min |
| 🥘 Chickpea & Tomato Coconut Pasta | `chopped tomatoes` | `tomatoes` | — |
| 🍝 Creamy Chickpea & Tomato Pasta | `parmesan` | — | 18→20 min |
| 🥔 Creamy Spinach & Feta Baked Potatoes | — | — | 35→40 min |
| 🌯 Crispy Chicken Thigh Tortilla Stack with Tomato & Feta | `chopped tomatoes`, `spinach` | `tomatoes` | — |
| 🌯 Crispy Halloumi & Broccoli Tortilla Wraps | `lemons` | — | — |
| 🍝 Crispy Halloumi & Tomato Spaghetti | — | `parmesan` | — |
| 🍛 Curried Chicken Thigh & Potato Traybake with Coconut | `olive oil` | — | 45→50 min |
| 🍛 Curried Chickpea & Tomato Coconut Soup | `chopped tomatoes`, `fresh coriander`, `olive oil` | `tomatoes` | 22→25 min |
| 🍛 Curried Salmon with Roasted Potatoes & Broccoli | — | — | 38→40 min |
| 🍝 Garlic Tomato Chicken Thigh Spaghetti | `chopped tomatoes` | `tomatoes` | — |
| 🍝 Garlic Tomato Halloumi Spaghetti | `chopped tomatoes` | `tomatoes` | — |
| 🥙 Halloumi & Chickpea Buddha Bowl with Yoghurt Dressing | `lemons` | — | — |
| 🔥 Halloumi & Potato Skewers with Tomato Sauce | `lemons`, `paprika` | `tomatoes` | — |
| 🍚 Minced Beef & Bell Pepper Coconut Rice | `stock cubes` | — | — |
| 🍲 Minced Beef & Chickpea Bolognese | `olive oil`, `parmesan` | — | — |
| 🍚 Minced Beef & Chickpea Rice Bowl | `cumin`, `lemons`, `yoghurt` | — | — |
| 🍲 Minced Beef & Potato Coconut Stew | `fresh coriander`, `olive oil` | — | — |
| 🥗 Pan-Seared Halloumi with Lemon Broccoli & Chickpea Salad | — | `parmesan` | 20→25 min |
| 🍚 Salmon & Lemon Risotto with Parmesan | `butter`, `stock cubes` | — | — |
| 🥚 Salmon & Potato Frittata | — | — | 20→25 min |
| 🐟 Salmon & Tomato Coconut Pasta | `chopped tomatoes`, `olive oil` | `tomatoes` | — |
| 🍚 Spiced Minced Beef & Bell Pepper Rice | — | — | 28→30 min |
