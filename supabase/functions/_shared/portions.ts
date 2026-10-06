// Servings math for the basket. The block between the markers is copied
// byte-for-byte into index.html (no bundler). Pack sizes live in PACKS here
// and on INGREDIENTS in the client; a contracts test checks they match.
//
// Seasonings are never scaled. Aromatics scale a little less at 6. Packs are
// always whole: ceil(need / pack). A meal with no portions contributes one
// pack of each grocery (max, not a sum) so an unverified catalog does not
// multiply the shop.

/* portions:start */
const SEASONINGS=["salt","black pepper","paprika","cumin","chilli flakes","mixed herbs","soy sauce","stock cubes"];
function normServings(n){
  const x=Math.round(+n);
  if(x>=5)return 6;
  if(x>=3)return 4;
  return 2;
}
function servingsFromHousehold(size){
  const n=size==="4+"?4:Math.round(+size);
  if(!(n>=1))return 2;
  if(n<=2)return 2;
  if(n<=4)return 4;
  return 6;
}
function scalePortion(amount, unit, key, servings){
  const s=normServings(servings);
  const f=s/2;
  const aromatic=key==="onions"||key==="garlic";
  const af=aromatic&&s===6?0.75*f:f;
  const a=+amount;
  if(!(a>=0))return 0;
  if(unit==="pc"||unit==="clove")return Math.ceil(a*af);
  return a*af;
}
function basketFor(weekMeals, servings, cupboardTicks, catalog, strict){
  const cat=catalog||{};
  const have={};
  (Array.isArray(cupboardTicks)?cupboardTicks:[]).forEach(function(k){have[String(k)]=1;});
  const need={};
  const seen={};
  const meals=Array.isArray(weekMeals)?weekMeals:[];
  function markSeasoning(list){
    (Array.isArray(list)?list:[]).forEach(function(key){
      if(SEASONINGS.indexOf(key)>=0&&cat[key])seen[key]=1;
    });
  }
  meals.forEach(function(meal){
    const ing=Array.isArray(meal&&meal.ing)?meal.ing:[];
    markSeasoning(ing);
    const raw=meal&&meal.portions&&typeof meal.portions==="object"&&!Array.isArray(meal.portions)?meal.portions:null;
    const groceryKeys=raw?Object.keys(raw).filter(function(k){return SEASONINGS.indexOf(k)<0&&cat[k]&&cat[k].pack>0;}):[];
    if(!groceryKeys.length){
      ing.forEach(function(key){
        if(SEASONINGS.indexOf(key)>=0||!cat[key]||!(cat[key].pack>0))return;
        need[key]=Math.max(need[key]||0,cat[key].pack);
        seen[key]=1;
      });
      return;
    }
    groceryKeys.forEach(function(key){
      const spec=raw[key];
      const pack=cat[key].pack;
      const pu=cat[key].pu;
      const bad=!Array.isArray(spec)||spec.length<2||String(spec[1])!==pu;
      if(bad){
        if(strict)throw new Error("unit mismatch "+key);
        console.log("portion unit mismatch",key);
        need[key]=Math.max(need[key]||0,pack);
        seen[key]=1;
        return;
      }
      need[key]=(need[key]||0)+scalePortion(+spec[0],String(spec[1]),key,servings);
      seen[key]=1;
    });
  });
  const packs={};
  Object.keys(seen).forEach(function(key){
    if(have[key])return;
    if(SEASONINGS.indexOf(key)>=0){packs[key]=1;return;}
    const pack=cat[key]&&cat[key].pack;
    if(!(pack>0))return;
    const amount=need[key]||0;
    if(!(amount>0))return;
    let q=Math.ceil(amount/pack-1e-9);
    if(q<1)q=1;
    if(q>50)q=50;
    packs[key]=q;
  });
  return packs;
}
/* portions:end */

export { SEASONINGS, normServings, servingsFromHousehold, scalePortion, basketFor }

// pack = how many of `pu` are in one shop pack. null = a seasoning (always 1).
export const PACKS: Record<string, { pack: number | null, pu: string }> = {
  "chicken thighs": { pack: 4, pu: "pc" },
  "salmon fillet": { pack: 2, pu: "pc" },
  "minced beef": { pack: 500, pu: "g" },
  "halloumi": { pack: 225, pu: "g" },
  "eggs": { pack: 6, pu: "pc" },
  "chickpeas": { pack: 400, pu: "g" },
  "rice": { pack: 1000, pu: "g" },
  "spaghetti": { pack: 500, pu: "g" },
  "tortillas": { pack: 8, pu: "pc" },
  "coconut milk": { pack: 400, pu: "ml" },
  "curry paste": { pack: 12, pu: "tbsp" },
  "passata": { pack: 500, pu: "g" },
  "onions": { pack: 6, pu: "pc" },
  "garlic": { pack: 40, pu: "clove" },
  "bell peppers": { pack: 3, pu: "pc" },
  "broccoli": { pack: 1, pu: "pc" },
  "spinach": { pack: 240, pu: "g" },
  "tomatoes": { pack: 6, pu: "pc" },
  "lemons": { pack: 3, pu: "pc" },
  "potatoes": { pack: 1000, pu: "g" },
  "olive oil": { pack: 33, pu: "tbsp" },
  "feta": { pack: 200, pu: "g" },
  "yoghurt": { pack: 500, pu: "g" },
  "parmesan": { pack: 80, pu: "g" },
  "chopped tomatoes": { pack: 400, pu: "g" },
  "butter": { pack: 250, pu: "g" },
  "fresh coriander": { pack: 30, pu: "g" },
  "tomato puree": { pack: 65, pu: "g" },
  "fresh ginger": { pack: 100, pu: "g" },
  "garam masala": { pack: 20, pu: "tsp" },
  "limes": { pack: 5, pu: "pc" },
  "spring onions": { pack: 6, pu: "pc" },
  "penne": { pack: 500, pu: "g" },
  "arborio rice": { pack: 500, pu: "g" },
  "fresh basil": { pack: 30, pu: "g" },
  "cucumber": { pack: 1, pu: "pc" },
  "red onions": { pack: 3, pu: "pc" },
  "cheddar": { pack: 400, pu: "g" },
  "salt": { pack: null, pu: "" },
  "black pepper": { pack: null, pu: "" },
  "paprika": { pack: null, pu: "" },
  "cumin": { pack: null, pu: "" },
  "chilli flakes": { pack: null, pu: "" },
  "mixed herbs": { pack: null, pu: "" },
  "soy sauce": { pack: null, pu: "" },
  "stock cubes": { pack: null, pu: "" },
}
