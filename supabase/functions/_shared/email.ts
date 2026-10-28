// Plentry order-completion email (step 1).
// Pure render plus a small Resend client. No npm: imports, so Node tests can load this file.
// Step 2 (recipes) and step 3 (a branded template) have hooks below. Do not fill them here.

export type CompletionOrder = {
  id?: unknown
  email?: unknown
  address?: { email?: unknown } | null
  delivery_slot?: unknown
  slot_date?: unknown
  slot_start?: unknown
  slot_end?: unknown
  amount_captured?: unknown
}

export type RenderedMail = {
  subject: string
  text: string
  html: string
}

const DEFAULT_FROM = 'Plentry <orders@getplentry.com>'

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

// Step 2 — recipes. The snapshot will be orders.items.recipes.
// Leave this empty. Do not look the dinner up in the live catalog.
export function recipeBlock(_order: CompletionOrder): { text: string; html: string } {
  return { text: '', html: '<!-- step 2: recipes -->' }
}

// Step 3 — branded template. Step 1 wraps a plain document.
// Replace this with the Plentry shell (logo, colours, footer) and keep the escaped body.
export function brandWrap(innerHtml: string): string {
  return `<!DOCTYPE html><html><body>${innerHtml}</body></html>`
}

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
  const text = [testLine, confirmation, recipes.text].filter(Boolean).join('\n\n')
  const testHtml = opts?.test ? `<p><strong>TEST</strong> — this is a sample sent to you. No customer was emailed and no order was charged.</p>` : ''
  const inner = [
    testHtml,
    `<p>Your Plentry order <strong>#${escapeHtml(id)}</strong> is complete${when.phrase ? ` on ${escapeHtml(when.phrase)}` : ''}. Thank you.</p>`,
    `<p>You've been charged ${escapeHtml(amount)}. This confirms the captured amount.</p>`,
    recipes.html,
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

export function fromAddress(): string {
  return readEnv('ORDER_EMAIL_FROM') || DEFAULT_FROM
}

export function replyToAddress(): string | null {
  return readEnv('ORDER_EMAIL_REPLY_TO') || null
}
