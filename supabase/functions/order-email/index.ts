// Plentry — `order-email` Edge Function (step 1, completion email).
//
// (a) Webhook and sweep: pg_net posts {order_id} with the x-webhook-secret
//     header (same ORDER_WEBHOOK_SECRET as notify-order). Claims the row,
//     renders, sends via Resend, then marks sent or failed.
// (b) task 'test': an aal2 admin JWT. Sends a labelled TEST render to that
//     admin's own auth email. No claim and no orders write. A Resend 401/403
//     counts toward the config alert. A missing key does not.
//
// verify_jwt=false in config.toml. The webhook has no user JWT.
// Deploy by hand, under a GO: supabase functions deploy order-email
// Auto-deploy is off. Do not treat a merge as this function going live.
//
// Secrets (never logged):
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set ORDER_EMAIL_FROM='Plentry <orders@getplentry.com>'
//   supabase secrets set ORDER_EMAIL_REPLY_TO=hello@getplentry.com
//   Replies land at hello@ and are forwarded. Omitted when unset.
//   ORDER_WEBHOOK_SECRET is already set for notify-order.

import { withSupabase } from 'npm:@supabase/server'
import { allow, clientIdent, clientIp, TOO_MANY } from '../_shared/ratelimit.ts'
import {
  completionSendGate,
  configAlertText,
  fromAddress,
  recipientOf,
  renderCompletion,
  replyToAddress,
  sendResend,
} from '../_shared/email.ts'

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let d = 0
  for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i]
  return d === 0
}

function bearer(req: Request): string {
  const header = req.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : ''
}

// aal lives on the access token. @supabase/server userClaims has no aal
// (pay's capture check reads jwtClaims.aal for the same reason). auth: 'none'
// does not fill jwtClaims, so this reads the payload only after GoTrue has
// accepted the token via getUser.
function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const pad = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0]
    return row && typeof row === 'object' ? row as Record<string, unknown> : null
  }
  if (data && typeof data === 'object') return data as Record<string, unknown>
  return null
}

async function mark(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }> },
  orderId: number,
  ok: boolean,
  messageId: string | null,
  error: string | null,
  skipped = false,
  terminal = false,
) {
  const { error: rpcError } = await admin.rpc('mark_completion_email', {
    p_order_id: orderId,
    p_ok: ok,
    p_message_id: messageId,
    p_error: error,
    p_skipped: skipped,
    p_terminal: terminal,
  })
  return rpcError
}

async function release(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }> },
  orderId: number,
) {
  const { error: rpcError } = await admin.rpc('release_completion_email', { p_order_id: orderId })
  return rpcError
}

// The streak lives in completion_email_config, so a cold start does not reset it.
// A 401/403 release counts. The third one in a streak sends one Telegram.
// A successful send (customer or test) re-arms. There is no time cooldown.
// If Telegram does not accept the message, the alert flag is cleared and the
// next 401/403 tries once more. The token and chat id are never logged.
async function noteConfigSuccess(ctx: any): Promise<void> {
  const { error } = await ctx.supabaseAdmin.rpc('note_completion_email_config_success')
  if (error) console.error('order-email config counter reset')
}

async function sendConfigTelegram(): Promise<boolean> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')
  if (!token || !chatId) {
    console.error('order-email config alert: telegram not configured')
    return false
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: configAlertText(),
        disable_web_page_preview: true,
      }),
    })
    if (!r.ok) {
      console.error('order-email config alert: telegram', r.status)
      return false
    }
    return true
  } catch {
    console.error('order-email config alert: telegram unreachable')
    return false
  }
}

async function noteConfigFailure(ctx: any): Promise<void> {
  const { data, error } = await ctx.supabaseAdmin.rpc('note_completion_email_config_failure')
  if (error) {
    console.error('order-email config counter')
    return
  }
  const row = firstRow(data)
  if (row?.alert !== true) return
  const sent = await sendConfigTelegram()
  if (sent) return
  const rearm = await ctx.supabaseAdmin.rpc('rearm_completion_email_config_alert')
  if (rearm.error) console.error('order-email config alert rearm')
}

// task 'test' — admin with aal2, own auth email, no orders write.
// IP limit runs before getUser so a missing or junk token still costs a slot.
async function sendTestEmail(req: Request, ctx: any): Promise<Response> {
  const ip = `ip:${clientIp(req)}`
  if (!(await allow(ctx.supabaseAdmin, 'order_email_test_ip', ip, 20, 3600, false))) return TOO_MANY()

  const jwt = bearer(req)
  if (!jwt) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { data, error } = await ctx.supabaseAdmin.auth.getUser(jwt)
  const email = data?.user?.email
  if (error || !email) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const claims = jwtPayload(jwt)
  if (claims?.aal !== 'aal2') {
    return Response.json({ error: 'mfa_required', detail: 'Enter your 2-step verification code, then try again.' }, { status: 403 })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon) return Response.json({ error: 'forbidden' }, { status: 403 })
  const adminCheck = await fetch(`${url}/rest/v1/rpc/is_admin_aal2`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  const allowed = adminCheck.ok && (await adminCheck.json().catch(() => false)) === true
  if (!allowed) return Response.json({ error: 'forbidden' }, { status: 403 })

  const ident = clientIdent(req, { userClaims: { sub: data.user.id } })
  if (!(await allow(ctx.supabaseAdmin, 'order_email_test', ident, 5, 3600, false))) return TOO_MANY()

  const rendered = renderCompletion({
    id: 'TEST',
    delivery_slot: 'Thu, 30 Oct, 10:00–12:00',
    slot_date: '2026-10-30',
    slot_start: '10:00',
    slot_end: '12:00',
    amount_captured: 26.25,
  }, { test: true })
  const sent = await sendResend({
    from: fromAddress(),
    to: email,
    replyTo: replyToAddress(),
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    idempotencyKey: `order-complete/test/${data.user.id}/${Date.now()}`,
  })
  if (!sent.ok) {
    if (sent.kind === 'config') await noteConfigFailure(ctx)
    return Response.json({ ok: false, error: sent.error }, { status: sent.error === 'RESEND_API_KEY missing' ? 500 : 502 })
  }
  await noteConfigSuccess(ctx)
  return Response.json({ ok: true, test: true })
}

async function deliverOrder(ctx: any, orderId: number): Promise<Response> {
  const gate = completionSendGate({
    apiKey: Deno.env.get('RESEND_API_KEY'),
    from: fromAddress(),
  })
  if (!gate.ok) {
    console.error('order-email not configured')
    return Response.json({ ok: false, error: gate.error }, { status: 503 })
  }

  const { data, error } = await ctx.supabaseAdmin.rpc('claim_completion_email', { p_order_id: orderId })
  if (error) {
    return Response.json({ error: 'claim', detail: String((error as { message?: string }).message || error).slice(0, 200) }, { status: 500 })
  }
  const row = firstRow(data)
  if (!row || row.id == null) return Response.json({ ok: true, noop: true })

  const to = recipientOf(row as { email?: unknown; address?: unknown })
  if (!to) {
    await mark(ctx.supabaseAdmin, orderId, false, null, 'no recipient', true, false)
    return Response.json({ ok: true, skipped: true })
  }

  const rendered = renderCompletion(row)
  try {
    const sent = await sendResend({
      from: gate.from,
      to,
      replyTo: replyToAddress(),
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: `order-complete/${orderId}`,
    })
    if (!sent.ok) {
      if (sent.kind === 'config' || sent.kind === 'retry' || sent.kind === 'missing') {
        console.error('order-email resend', sent.kind, sent.status || 0, sent.name || '')
        const released = await release(ctx.supabaseAdmin, orderId)
        if (released) return Response.json({ ok: false, error: 'release' }, { status: 500 })
        if (sent.kind === 'config') await noteConfigFailure(ctx)
        const status = sent.kind === 'retry' ? 409 : 503
        return Response.json({ ok: false, error: sent.kind === 'retry' ? 'resend retry' : 'resend config' }, { status })
      }
      if (sent.kind === 'terminal') {
        console.error('order-email invalid_idempotent_request; marked failed and will not retry', orderId)
        await mark(ctx.supabaseAdmin, orderId, false, null, 'invalid_idempotent_request: not retrying', false, true)
        return Response.json({ ok: false, error: 'invalid_idempotent_request' }, { status: 409 })
      }
      await mark(ctx.supabaseAdmin, orderId, false, null, sent.error, false, false)
      return Response.json({ ok: false, error: 'resend' }, { status: 502 })
    }
    await noteConfigSuccess(ctx)
    const markError = await mark(ctx.supabaseAdmin, orderId, true, sent.id || null, null, false)
    if (markError) {
      return Response.json({ ok: false, error: 'mark' }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch {
    await mark(ctx.supabaseAdmin, orderId, false, null, 'resend unreachable', false)
    return Response.json({ ok: false, error: 'resend' }, { status: 502 })
  }
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'method not allowed' }, { status: 405 })
    const body = await req.json().catch(() => null)

    if (body?.task === 'test') return sendTestEmail(req, ctx)

    const secret = Deno.env.get('ORDER_WEBHOOK_SECRET')
    if (!secret || !timingSafeEqual(req.headers.get('x-webhook-secret') || '', secret)) {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }

    const orderId = Number(body?.order_id)
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return Response.json({ error: 'bad order_id' }, { status: 400 })
    }
    return deliverOrder(ctx, orderId)
  }),
}
