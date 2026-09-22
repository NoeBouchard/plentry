// Shared rate-limit helper for Plentry edge functions.
//
// Backed by public.check_rate_limit() (see supabase/security_hardening.sql —
// applied to live Postgres 17 Sep 2026; before that the RPC did not exist and
// every limit failed open). Keyed by the signed-in user id, or the client IP
// when logged out (the `ai` endpoint accepts the public publishable key, so
// anonymous abuse is possible without this).
//
// Fail policy (S-03): signed-in callers fail OPEN on a DB error (availability);
// anonymous callers fail CLOSED — the product never needs `ai` logged out, so
// an unlimited anonymous path is pure cost exposure.
//
// Returns true when the caller is WITHIN the limit (allow), false when they are
// over it (the caller should return HTTP 429).

// S-03: the FIRST x-forwarded-for entry is whatever the client sent; the proxy
// APPENDS the real peer address. Use the LAST entry, bound its length, and keep
// only address characters so a hostile header cannot mint a fresh bucket per
// request (or a giant key).
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
  const last = parts.length ? parts[parts.length - 1] : (req.headers.get('x-real-ip') || '')
  const ip = last.replace(/[^0-9a-fA-F.:]/g, '').slice(0, 45)
  return ip || 'unknown'
}

export function clientIdent(req: Request, ctx: { userClaims?: { sub?: string } }): string {
  const uid = ctx?.userClaims?.sub
  if (uid) return String(uid).slice(0, 64)
  return `ip:${clientIp(req)}`
}

export async function allow(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  bucket: string,
  ident: string,
  max: number,
  windowSeconds: number,
  failOpen = true,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_bucket: bucket,
      p_ident: ident,
      p_max: max,
      p_window_seconds: windowSeconds,
    })
    if (error) {
      console.error('check_rate_limit error', bucket, String((error as any)?.message || error).slice(0, 200))
      return failOpen
    }
    return data !== false
  } catch (e) {
    console.error('check_rate_limit threw', bucket, String(e).slice(0, 200))
    return failOpen
  }
}

export const TOO_MANY = () =>
  Response.json({ error: 'rate_limited', detail: 'Too many requests — slow down.' }, { status: 429 })
