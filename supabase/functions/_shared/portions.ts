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
// The block also holds the recipe-step placeholder renderer (renderStep and
// friends). It shares portionFactor with scalePortion, so the step text and
// the basket can't drift apart.

/* portions:start */
const SEASONINGS=["salt","black pepper","paprika","cumin","chilli flakes","mixed herbs","soy sauce","stock cubes","garam masala"];
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
  const af=portionFactor(key,servings);
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
// Recipe-step placeholders (plan of 28 Oct 2026). A step may carry tokens
// {{type:body=fallback}}; the fallback is the 2-serving text. renderStep shows
// them for 2, 4 or 6. Text with no braces comes back byte-for-byte unchanged.
// A bad token prints its fallback, and braces never reach the customer.
// Rounding matches the Python reference (round half to even).
const STEP_TOKEN=/\{\{([a-z0-9]+):([^{}=]*)=([^{}]*)\}\}/g;
const STEP_STRIP=/\{\{[a-z0-9]+:[^{}=]*=([^{}]*)\}\}/g;
const STEP_INDIVISIBLE=["eggs","tortillas","chicken thighs","salmon fillet","stock cubes"];
const STEP_PACKS=new Map([["chickpeas",{pack:400,pu:"g"}],["chopped tomatoes",{pack:400,pu:"g"}],["coconut milk",{pack:400,pu:"ml"}],["halloumi",{pack:225,pu:"g"}],["feta",{pack:200,pu:"g"}],["passata",{pack:500,pu:"g"}]]);
const STEP_FRAC=["","¼","½","¾"];
function stepRoundHalfEven(x){
  const r=Math.round(x);
  return Math.abs(x-Math.trunc(x))===0.5&&r%2!==0?r-1:r;
}
function stepG(x){return String(+(+x).toPrecision(6));}
function stepNumber(v){
  const t=String(v).trim();
  const m=/^(\d+)?\s*([¼½¾])$/.exec(t);
  if(m)return (m[1]?+m[1]:0)+("¼½¾".indexOf(m[2])+1)/4;
  const d=t.replace(/,/g,".");
  if(!/^(\d+\.?\d*|\.\d+)$/.test(d))throw new Error("bad number");
  return +d;
}
function fmtFrac(x){
  let best=null;
  for(let d=1;d<=4;d++){
    const n=Math.round(x*d);
    const err=Math.abs(x-n/d);
    if(best===null||err<best.err-1e-12)best={n,d,err};
  }
  const w=Math.floor(best.n/best.d);
  const rn=best.n-w*best.d;
  if(rn===0)return String(w);
  const q=rn*4/best.d;
  const glyph=Number.isInteger(q)&&q>0&&q<4?STEP_FRAC[q]:"";
  return (w?String(w):"")+(glyph||stepG(rn/best.d));
}
function portionFactor(key, servings){
  const s=normServings(servings);
  const f=s/2;
  return (key==="onions"||key==="garlic")&&s===6?0.75*f:f;
}
function roundStepAmount(a, unit, key){
  if(unit==="clove"||(unit==="pc"&&STEP_INDIVISIBLE.indexOf(key)>=0))return Math.ceil(a-1e-9);
  if(unit==="pc")return Math.ceil(a*2-1e-9)/2;
  if(unit==="g"||unit==="ml"){
    let step=a<100?5:a<1000?10:50;
    if(unit==="ml"&&a>=100)step=a<1000?25:50;
    return Math.max(step,stepRoundHalfEven(a/step)*step);
  }
  if(unit==="tbsp")return Math.max(0.5,stepRoundHalfEven(a*2)/2);
  if(unit==="tsp")return Math.max(0.25,stepRoundHalfEven(a*4)/4);
  return a;
}
function fmtStepAmount(a, unit){
  if(unit==="g")return a>=1000?stepG(a/1000)+"kg":stepG(a)+"g";
  if(unit==="ml")return a>=1000?stepG(a/1000)+" litres":stepG(a)+"ml";
  if(unit==="tbsp"||unit==="tsp")return fmtFrac(a)+" "+unit;
  return fmtFrac(a);
}
// Seasoning: light scale, x1.75 at 4 and x2.5 at 6. 3 tsp or more shows as tbsp.
function tasteAmount(a, unit, servings){
  const f=normServings(servings)/2;
  const tf=1+0.75*(f-1);
  let v=a*tf;
  if(unit==="tsp"){
    v=roundStepAmount(v,"tsp");
    if(v>=3)return fmtFrac(roundStepAmount(v/3,"tbsp"))+" tbsp";
    return fmtFrac(v)+" tsp";
  }
  return fmtFrac(roundStepAmount(v,"tbsp"))+" tbsp";
}
// "a 400g tin" x2 -> "2 × 400g tins"; "a drained 400g tin" x2 -> "2 drained 400g tins".
function stepTinPhrase(fallback, count){
  const m=/^an? ((?:[a-z]+ )*?)(\d+(?:g|ml)) (tin|can|block|pack|carton)$/.exec(fallback);
  if(!m||Math.abs(count-Math.round(count))>1e-6)return null;
  const c=Math.round(count);
  if(c===1)return fallback;
  return m[1]?c+" "+m[1]+m[2]+" "+m[3]+"s":c+" × "+m[2]+" "+m[3]+"s";
}
function stepPortion(body, portions, s){
  const parts=String(body).split("|");
  const head=parts[0];
  const i=head.indexOf(":");
  const key=i<0?head:head.slice(0,i);
  const sub=i<0?"":head.slice(i+1);
  const ok=portions&&typeof portions==="object"&&!Array.isArray(portions)&&Object.prototype.hasOwnProperty.call(portions,key);
  const p=ok?portions[key]:null;
  if(!Array.isArray(p)||p.length<2)return null;
  const base=sub?stepNumber(sub):+p[0];
  if(!Number.isFinite(base)||base<0)throw new Error("bad portion");
  const unit=String(p[1]);
  const raw=base*portionFactor(key,s);
  return {key,unit,raw,tin:parts.slice(1).indexOf("tin")>=0,a:roundStepAmount(raw,unit,key)};
}
function stepToken(typ, body, fb, portions, s){
  if(typ==="qty"){
    const q=stepPortion(body,portions,s);
    if(!q)return fb;
    const pk=STEP_PACKS.get(q.key);
    if(q.tin&&pk){
      const ph=stepTinPhrase(fb,q.raw/pk.pack);
      if(ph)return ph;
    }
    // An exact pack multiple shows as is (3 × 225g = 675g, not 680g), so the
    // text never asks for more than the basket buys.
    if(pk&&pk.pu===q.unit&&Math.abs(q.raw/pk.pack-stepRoundHalfEven(q.raw/pk.pack))<1e-6)return fmtStepAmount(q.raw,q.unit);
    return fmtStepAmount(q.a,q.unit);
  }
  if(typ==="pl"){
    const b=body.split("|");
    if(b.length!==3)return fb;
    const q=stepPortion(b[0],portions,s);
    if(!q)return fb;
    return q.a>1?b[2]:b[1];
  }
  if(typ==="n"){
    const b=body.split("|");
    const c=Math.ceil(stepNumber(b[0])*s/2-1e-9);
    if(b.length===3)return c+" "+(c===1?b[1]:b[2]);
    return String(c);
  }
  if(typ==="x"||typ==="taste"){
    const b=body.trim().split(/\s+/);
    if(b.length!==2)return fb;
    const unit=b[1];
    if(typ==="taste"){
      if(unit!=="tsp"&&unit!=="tbsp")return fb;
      return tasteAmount(stepNumber(b[0]),unit,s);
    }
    if(["g","ml","tbsp","tsp"].indexOf(unit)<0)return fb;
    return fmtStepAmount(roundStepAmount(stepNumber(b[0])*s/2,unit),unit);
  }
  if(typ==="at46")return body;
  return fb;
}
// Last line of defence: anything brace-shaped left over shows its fallback
// (the text after the first "="), or nothing. Never a brace.
function stepScrub(out){
  if(out.indexOf("{")<0&&out.indexOf("}")<0)return out;
  const tail=function(inner){const i=inner.indexOf("=");return i<0?"":inner.slice(i+1);};
  return out
    .replace(/\{\{([^{}]*)(\}\}?)?/g,function(_,inner,close){return close||inner.indexOf("=")>=0?tail(inner):inner;})
    .replace(/[{}]/g,"")
    .replace(/ {2,}/g," ");
}
function hasStepTokens(text){
  return /\{\{[a-z0-9]+:[^{}=]*=[^{}]*\}\}/.test(String(text==null?"":text));
}
// Old clients and old snapshots: the 2-serving text.
function stripStepTokens(text){
  const t=text==null?"":String(text);
  if(t.indexOf("{{")<0&&t.indexOf("}}")<0)return t;
  return stepScrub(t.replace(STEP_STRIP,"$1"));
}
function renderStep(text, portions, servings){
  const t=text==null?"":String(text);
  if(t.indexOf("{{")<0&&t.indexOf("}}")<0)return t;
  const s=normServings(servings);
  if(s===2)return stripStepTokens(t);
  const out=t.replace(STEP_TOKEN,function(_,typ,body,fb){
    try{return stepToken(typ,body,fb,portions,s);}catch(e){return fb;}
  }).replace(/ {2,}/g," ").split(" .").join(".");
  return stepScrub(out);
}
function renderSteps(steps, portions, servings){
  return (Array.isArray(steps)?steps:[]).map(function(st){return renderStep(st,portions,servings);});
}
// One recipe for a household. Tokenised text with no portions at all stays at
// 2 (the plain "multiply" note still applies) so qty and n amounts never mix.
function renderRecipeText(recipe, portions, servings){
  const steps=recipe&&Array.isArray(recipe.steps)?recipe.steps.map(function(st){return String(st);}):[];
  const tip=recipe&&recipe.tip!=null?String(recipe.tip):"";
  const tokens=steps.some(hasStepTokens)||hasStepTokens(tip);
  const hasPortions=!!(portions&&typeof portions==="object"&&!Array.isArray(portions)&&Object.keys(portions).length);
  const s=tokens&&hasPortions?normServings(servings):2;
  return {steps:renderSteps(steps,portions,s),tip:renderStep(tip,portions,s),tokens,servings:s};
}
/* portions:end */

export { SEASONINGS, normServings, servingsFromHousehold, scalePortion, basketFor, firstShelfRow }
export { portionFactor, roundStepAmount, fmtStepAmount, tasteAmount, stepTinPhrase, hasStepTokens, stripStepTokens, renderStep, renderSteps, renderRecipeText }

// Order email (#34 recipeBlock) and any other server-side reader of an order
// snapshot: each snapshotted method rendered for the order's servings with the
// snapshot's own portions. Old snapshots (no tokens, or no servings) come back
// as written. Pure, no I/O.
export function orderRecipesText(items: unknown): Array<{ name: string, steps: string[], tip: string, servings: number }> {
  const it = items && typeof items === "object" ? items as { recipes?: unknown, servings?: unknown } : {}
  const servings = normServings(it.servings)
  const list = Array.isArray(it.recipes) ? it.recipes : []
  const out: Array<{ name: string, steps: string[], tip: string, servings: number }> = []
  for (const row of list) {
    const r = row && typeof row === "object" ? row as { name?: unknown, recipe?: unknown, portions?: unknown } : null
    const rec = r && r.recipe && typeof r.recipe === "object" ? r.recipe as { steps?: unknown, tip?: unknown } : null
    if (!r || !rec || !Array.isArray(rec.steps) || !rec.steps.length) continue
    const shown = renderRecipeText(rec, r.portions, servings)
    out.push({ name: String(r.name ?? ""), steps: shown.steps, tip: shown.tip, servings: shown.servings })
  }
  return out
}

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
  "limes": { pack: 5, pu: "pc" },
  "spring onions": { pack: 6, pu: "pc" },
  "penne": { pack: 500, pu: "g" },
  "arborio rice": { pack: 500, pu: "g" },
  "fresh basil": { pack: 30, pu: "g" },
  "cucumber": { pack: 1, pu: "pc" },
  "red onions": { pack: 3, pu: "pc" },
  "cheddar": { pack: 400, pu: "g" },
  "garam masala": { pack: null, pu: "" },
  "salt": { pack: null, pu: "" },
  "black pepper": { pack: null, pu: "" },
  "paprika": { pack: null, pu: "" },
  "cumin": { pack: null, pu: "" },
  "chilli flakes": { pack: null, pu: "" },
  "mixed herbs": { pack: null, pu: "" },
  "soy sauce": { pack: null, pu: "" },
  "stock cubes": { pack: null, pu: "" },
}
