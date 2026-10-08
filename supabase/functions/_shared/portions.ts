// Servings math for the basket. The block between the markers is copied
// byte-for-byte into index.html (no bundler). Pack sizes live in PACKS here
// and on INGREDIENTS in the client; a contracts test checks they match.
//
// Seasonings are never scaled. Aromatics scale a little less at 6. Packs are
// always whole. Portioned meals sum a scaled need, then ceil(need / pack).
// If any no-portions dinner (or a unit mismatch) uses that ingredient, add
// one extra pack only when the spare in the last pack is under half a pack.
// Several such dinners share that one extra. A key used only by no-portions
// dinners is 1 pack. The optional store-pack argument replaces the code pack
// when its unit matches, or converts exactly between g/kg and ml/l.
// firstShelfRow picks one shelf row when meal_key and store are duplicated:
// the lowest numeric id, or the first row when ids are missing.

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
// Duplicate shelf rows for one meal_key and store: lowest numeric id, otherwise the first row.
function firstShelfRow(rows){
  let best=null;
  (Array.isArray(rows)?rows:[]).forEach(function(r){
    if(!r)return;
    if(!best){best=r;return;}
    const id=r.id==null||r.id===""?null:+r.id;
    const bid=best.id==null||best.id===""?null:+best.id;
    const has=id!==null&&Number.isFinite(id);
    const bhas=bid!==null&&Number.isFinite(bid);
    if(has&&(!bhas||id<bid))best=r;
  });
  return best;
}
function basketFor(weekMeals, servings, cupboardTicks, catalog, strict, storePacks){
  const cat=catalog||{};
  const shelf=storePacks&&typeof storePacks==="object"&&!Array.isArray(storePacks)?storePacks:{};
  function packOf(key){
    const code=cat[key];
    if(!code||!(code.pack>0))return 0;
    const row=shelf[key];
    const qty=row?+row.pack:0;
    if(!(qty>0))return code.pack;
    const cu=String(code.pu||"").toLowerCase();
    const su=String(row.pu||"").toLowerCase();
    if(su===cu)return qty;
    if((cu==="g"&&su==="kg")||(cu==="ml"&&su==="l"))return qty*1000;
    if((cu==="kg"&&su==="g")||(cu==="l"&&su==="ml"))return qty/1000;
    return code.pack;
  }
  const have={};
  (Array.isArray(cupboardTicks)?cupboardTicks:[]).forEach(function(k){have[String(k)]=1;});
  const need={};
  const hasNoPortion={};
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
        hasNoPortion[key]=1;
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
        hasNoPortion[key]=1;
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
    const pack=packOf(key);
    if(!(pack>0))return;
    const scaled=need[key]||0;
    const flagged=hasNoPortion[key]?1:0;
    if(!(scaled>0)&&!flagged)return;
    let q;
    if(!(scaled>0))q=1;
    else{
      q=Math.ceil(scaled/pack-1e-9);
      if(q<1)q=1;
      if(flagged){
        const spare=q*pack-scaled;
        if(spare<pack/2)q=q+1;
      }
    }
    if(q>50)q=50;
    packs[key]=q;
  });
  return packs;
}
/* portions:end */

export { SEASONINGS, normServings, servingsFromHousehold, scalePortion, basketFor, firstShelfRow }

// Shelf rows for one store, keyed by meal_key. basketFor decides whether the
// unit is usable. Rows with no meal_key are not basket packs. Duplicate
// meal_key rows use firstShelfRow (lowest id, else the first row).
export function storePacksFromPrices(rows: Array<{ id?: number | string | null, meal_key?: string | null, pack_qty?: number | string | null, pack_unit?: string | null }> | null | undefined) {
  const groups: Record<string, Array<{ id?: number | string | null, meal_key?: string | null, pack_qty?: number | string | null, pack_unit?: string | null }>> = {}
  for (const r of rows || []) {
    const key = r && r.meal_key ? String(r.meal_key) : ""
    if (!key) continue
    ;(groups[key] = groups[key] || []).push(r)
  }
  const out: Record<string, { pack: number, pu: string }> = {}
  for (const key of Object.keys(groups)) {
    const row = firstShelfRow(groups[key])
    if (!row) continue
    const qty = Number(row.pack_qty)
    const pu = String(row.pack_unit || "")
    if (!(qty > 0) || !pu) continue
    out[key] = { pack: qty, pu }
  }
  return out
}

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
  "lemons": { pack: 4, pu: "pc" },
  "potatoes": { pack: 2000, pu: "g" },
  "olive oil": { pack: 33, pu: "tbsp" },
  "feta": { pack: 200, pu: "g" },
  "yoghurt": { pack: 500, pu: "g" },
  "parmesan": { pack: 80, pu: "g" },
  "chopped tomatoes": { pack: 400, pu: "g" },
  "butter": { pack: 250, pu: "g" },
  "fresh coriander": { pack: 30, pu: "g" },
  "tomato puree": { pack: 200, pu: "g" },
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
