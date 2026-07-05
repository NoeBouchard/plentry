// Plentry — `orders` Edge Function (example of @supabase/server usage).
//
// auth: 'user' => caller must send a valid Supabase user JWT in the
// Authorization header. `ctx.supabase` is scoped to that user, so RLS on
// public.orders ("insert/select own orders") is enforced automatically.
//
// On the Supabase platform, SUPABASE_URL / keys / JWKS are auto-injected —
// no .env needed in production. Deploy: `supabase functions deploy orders`.
//
// GET  /functions/v1/orders        -> list the signed-in user's orders
// POST /functions/v1/orders {..}   -> create an order for the signed-in user

import { withSupabase } from 'npm:@supabase/server'

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    // List this user's orders (RLS limits rows to auth.uid()).
    if (req.method === 'GET') {
      const { data, error } = await ctx.supabase
        .from('orders')
        .select('id, store, total, items, status, created_at')
        .order('created_at', { ascending: false })

      if (error) return Response.json({ error: error.message }, { status: 400 })
      return Response.json(data)
    }

    // Create an order. user_id defaults to auth.uid() in the DB and the
    // RLS insert policy checks auth.uid() = user_id, so no spoofing is possible.
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 })

      const { data, error } = await ctx.supabase
        .from('orders')
        .insert({
          email: ctx.userClaims?.email ?? body.email ?? null,
          name: body.name ?? null,
          postcode: body.postcode ?? null,
          store: body.store ?? null,
          total: body.total ?? null,
          items: body.items ?? [],
        })
        .select()
        .single()

      if (error) return Response.json({ error: error.message }, { status: 400 })
      return Response.json(data, { status: 201 })
    }

    return Response.json({ error: 'method not allowed' }, { status: 405 })
  }),
}
