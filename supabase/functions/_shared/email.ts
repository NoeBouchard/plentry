// Plentry order-completion email.
// Pure render plus a small Resend client. No npm: imports, so Node tests can load this file.
// step 2 (recipes) renders the order's own snapshot with orderRecipesText from
// _shared/portions.ts. step 3 (a branded template) has a hook below.

import { orderRecipesText } from './portions.ts'

export type CompletionOrder = {
  id?: unknown
  email?: unknown
  address?: { email?: unknown } | null
  delivery_slot?: unknown
  slot_date?: unknown
  slot_start?: unknown
  slot_end?: unknown
  amount_captured?: unknown
  items?: unknown
}

export type RenderedMail = {
  subject: string
  text: string
  html: string
}

const DEFAULT_FROM = 'Plentry <orders@getplentry.com>'
const DEFAULT_REPLY_TO = 'hello@getplentry.com'

export function defaultFrom(): string {
  return DEFAULT_FROM
}

function readEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno
  if (deno?.env?.get) {
    const value = deno.env.get(name)
    if (value != null && String(value).trim() !== '') return String(value).trim()
    return undefined
  }
  const fromProcess = typeof process !== 'undefined' ? process.env?.[name] : undefined
  if (fromProcess != null && String(fromProcess).trim() !== '') return String(fromProcess).trim()
  return undefined
}

export function escapeHtml(value: unknown): string {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

function cleanLine(value: unknown, max = 160): string {
  return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function orderLabel(id: unknown): string {
  const label = cleanLine(id, 40)
  return label || '—'
}

function formatSlotDate(value: unknown): string {
  const raw = String(value == null ? '' : value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const [y, m, d] = raw.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function clock(value: unknown): string {
  const raw = String(value == null ? '' : value).trim()
  const match = raw.match(/^(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : ''
}

export function formatGbp(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '£—'
  return `£${n.toFixed(2)}`
}

// delivery_slot is the window Ops confirmed. Use it once: it often already
// names the day, so do not also prefix slot_date. Otherwise slot_date plus
// slot_start/slot_end. An empty phrase means neither was set.
export function completionWhen(order: CompletionOrder): { date: string; slot: string; phrase: string } {
  const booked = cleanLine(order?.delivery_slot)
  const date = formatSlotDate(order?.slot_date)
  const start = clock(order?.slot_start)
  const end = clock(order?.slot_end)
  const window = start && end ? `${start}–${end}` : ''
  const slot = booked || window
  let phrase = ''
  if (booked) phrase = booked
  else if (date && window) phrase = `${date}, ${window}`
  else phrase = date || window
  return { date, slot, phrase }
}

export function completionSentence(id: string, phrase: string, amount: string): string {
  const when = phrase ? ` on ${phrase}` : ''
  return `Your Plentry order #${id} is complete${when}. Thank you. You've been charged ${amount}.`
}

export function recipientOf(order: { email?: unknown; address?: unknown } | null | undefined): string | null {
  const direct = cleanLine(order?.email, 200)
  if (direct) return direct
  const address = order?.address
  if (address && typeof address === 'object') {
    const nested = cleanLine((address as { email?: unknown }).email, 200)
    if (nested) return nested
  }
  return null
}

// Step 2 — recipes from the order snapshot (orders.items.recipes, servings),
// rendered by orderRecipesText so the amounts match what the app showed.
// Never looks the dinner up in the live catalog. No snapshot, no block.
export function recipeBlock(order: CompletionOrder): { text: string; html: string } {
  const recipes = orderRecipesText(order?.items)
  if (!recipes.length) return { text: '', html: '' }
  const text: string[] = ['Your recipes']
  const html: string[] = ['<h2>Your recipes</h2>']
  for (const r of recipes) {
    const name = cleanLine(r.name, 120) || 'Dinner'
    const note = `Amounts in these steps are for ${r.servings} people.`
    text.push([name, note, ...r.steps.map((step, i) => `${i + 1}. ${step}`), r.tip ? `Tip: ${r.tip}` : ''].filter(Boolean).join('\n'))
    html.push(
      `<h3>${escapeHtml(name)}</h3>`,
      `<p><em>${escapeHtml(note)}</em></p>`,
      `<ol>${r.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`,
      r.tip ? `<p>Tip: ${escapeHtml(r.tip)}</p>` : '',
    )
  }
  return { text: text.join('\n\n'), html: html.filter(Boolean).join('\n') }
}

// Step 3 — branded template. Step 1 wraps a plain document.
// Replace this with the Plentry shell (logo, colours, footer) and keep the escaped body.
export function brandWrap(innerHtml: string): string {
  return `<!DOCTYPE html><html><body>${innerHtml}</body></html>`
}

// Transactional footer, text and HTML. No unsubscribe link: this is a
// receipt for an order, not marketing.
export const FOOTER_TEXT = 'Plentry · getplentry.com · Questions? Reply to this email or write to hello@getplentry.com'
export const FOOTER_HTML = '<hr><p style="color:#666;font-size:12px">Plentry · <a href="https://getplentry.com">getplentry.com</a> · Questions? Reply to this email or write to <a href="mailto:hello@getplentry.com">hello@getplentry.com</a></p>'

export function renderCompletion(order: CompletionOrder, opts?: { test?: boolean }): RenderedMail {
  const id = orderLabel(order?.id)
  const when = completionWhen(order || {})
  const amount = formatGbp(order?.amount_captured)
  const recipes = recipeBlock(order || {})
  const subject = `${opts?.test ? '[TEST] ' : ''}Your Plentry order #${id} is complete`
  const confirmation = completionSentence(id, when.phrase, amount)
  const testLine = opts?.test
    ? 'TEST — this is a sample sent to you. No customer was emailed and no order was charged.'
    : ''
  const text = [testLine, confirmation, recipes.text, FOOTER_TEXT].filter(Boolean).join('\n\n')
  const testHtml = opts?.test ? `<p><strong>TEST</strong> — this is a sample sent to you. No customer was emailed and no order was charged.</p>` : ''
  const inner = [
    testHtml,
    `<p>Your Plentry order <strong>#${escapeHtml(id)}</strong> is complete${when.phrase ? ` on ${escapeHtml(when.phrase)}` : ''}. Thank you.</p>`,
    `<p>You've been charged ${escapeHtml(amount)}. This confirms the captured amount.</p>`,
    recipes.html,
    FOOTER_HTML,
  ].filter(Boolean).join('\n')
  return { subject, text, html: brandWrap(inner) }
}

export type SendResendInput = {
  from: string
  to: string
  replyTo?: string | null
  subject: string
  text: string
  html: string
  idempotencyKey: string
}

export type ResendFailureKind = 'missing' | 'config' | 'retry' | 'terminal' | 'failed'

export type SendResendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; kind: ResendFailureKind; status?: number; name?: string }

// One Telegram when Resend has rejected the key or the domain three times.
// No token, chat id, or key. The counter that decides when to send this lives in SQL.
export function configAlertText(): string {
  return 'Plentry order email: Resend rejected the API key or the sending domain three times in a row (401/403). The email config looks wrong (bad key or unverified domain). This alert is sent once until a send succeeds.'
}

// Missing key or a blank resolved From is a config gap. Do not claim a row for it.
export function completionSendGate(input: { apiKey?: string | null; from?: string | null }):
  { ok: true; from: string } | { ok: false; error: string } {
  const apiKey = input.apiKey == null ? '' : String(input.apiKey).trim()
  const from = input.from == null ? '' : String(input.from).trim()
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' }
  if (!from) return { ok: false, error: 'ORDER_EMAIL_FROM missing' }
  return { ok: true, from }
}

// 401/403: bad key or domain, release the claim. concurrent_idempotent_requests
// is a retry, also released. invalid_idempotent_request is terminal.
export function classifyResendFailure(status: number, name: string): Exclude<ResendFailureKind, 'missing'> {
  if (status === 401 || status === 403) return 'config'
  const code = String(name || '').trim()
  if (status === 409 && code === 'concurrent_idempotent_requests') return 'retry'
  if (status === 409 && code === 'invalid_idempotent_request') return 'terminal'
  return 'failed'
}

function safeError(text: string, apiKey: string): string {
  const cleaned = apiKey ? text.split(apiKey).join('[redacted]') : text
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, 300) || 'resend failed'
}

// Reads RESEND_API_KEY from the environment. Never logs it.
// Omits reply_to when replyTo is unset. Does not throw when the key is missing.
export async function sendResend(input: SendResendInput): Promise<SendResendResult> {
  const apiKey = readEnv('RESEND_API_KEY')
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing', kind: 'missing' }
  const payload: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    text: input.text,
    html: input.html,
  }
  const reply = input.replyTo && String(input.replyTo).trim()
  if (reply) payload.reply_to = reply
  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, error: 'resend unreachable', kind: 'failed' }
  }
  const raw = await res.text().catch(() => '')
  let parsed: { id?: unknown; message?: unknown; error?: unknown; name?: unknown } | null = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }
  if (!res.ok) {
    const name = parsed && typeof parsed.name === 'string' ? parsed.name : ''
    const message = parsed?.message || parsed?.error || raw || `resend ${res.status}`
    return {
      ok: false,
      error: safeError(String(message), apiKey),
      kind: classifyResendFailure(res.status, name),
      status: res.status,
      name,
    }
  }
  return { ok: true, id: String(parsed?.id || '') }
}

// Kill switch. Customer completion emails go out only when ORDER_EMAIL_ENABLED
// is 1, true, on, or yes (any case). Unset, blank, or anything else is off.
// Flip it with `supabase secrets set`, no deploy. While it is off, order-email
// returns before the row claim, so no row changes. Once it is back on, the
// SQL 24-hour rule applies: only orders confirmed within 24 hours are sent;
// older ones are marked skipped ('stale: confirmed >24h before send').
export function completionEnabled(value: string | null | undefined = readEnv('ORDER_EMAIL_ENABLED')): boolean {
  const flag = value == null ? '' : String(value).trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes'
}

export function fromAddress(): string {
  return readEnv('ORDER_EMAIL_FROM') || DEFAULT_FROM
}

// Replies go to hello@getplentry.com (Cloudflare Email Routing forwards them).
// ORDER_EMAIL_REPLY_TO may override it; it is not required.
export function replyToAddress(): string {
  return readEnv('ORDER_EMAIL_REPLY_TO') || DEFAULT_REPLY_TO
}
