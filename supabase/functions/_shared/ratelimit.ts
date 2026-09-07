// Shared rate-limit helper for Plentry edge functions.
//
// Backed by public.check_rate_limit() (see supabase/security_hardening.sql).
// Keyed by the signed-in user id, or the client IP when logged out (the `ai`
// endpoint accepts the public publishable key, so anonymous abuse is possible
// without this). Fails OPEN: if the DB call errors we allow the request rather
// than take the whole app down on a transient hiccup.
//
// Returns true when the caller is WITHIN the limit (allow), false when they are
// over it (the caller should return HTTP 429).

export function clientIdent(req: Request, ctx: { userClaims?: { sub?: string } }): string {
  const uid = ctx?.userClaims?.sub
  if (uid) return uid
  const xff = req.headers.get('x-forwarded-for') || ''
  const ip = xff.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  return `ip:${ip}`
}

export async function allow(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  bucket: string,
  ident: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_bucket: bucket,
      p_ident: ident,
      p_max: max,
      p_window_seconds: windowSeconds,
    })
    if (error) return true // fail open
    return data !== false
  } catch {
    return true // fail open
  }
}

export const TOO_MANY = () =>
  Response.json({ error: 'rate_limited', detail: 'Too many requests — slow down.' }, { status: 429 })
