// Capture maths and the orders-row write. No Deno, no Stripe SDK: pay/index.ts
// passes the HTTP and the Supabase update in. Amounts are pounds, 2 dp, same
// units as orders.amount_captured and orders.amount_held.

export const COMMISSION = 0.05

// First write, then 3 retries (2–3 in the brief). Backoff is between tries.
export const CAPTURE_DB_ATTEMPTS = 4
const BACKOFF_MS = [200, 400, 800]

export type CaptureSplit = {
  store_total: number
  amount_captured: number
  fee_amount: number
  overrun_amount: number
  gross: number
  hold: number
}

export function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100
}

// 5% of an integer pence amount, half-up. Pound floats do not match this:
// £4.30 × 1.05 rounds to £4.51 in round2, and to 452 pence here.
function grossPenceFromStore(storePence: number): number {
  return Math.round(storePence * 105 / 100)
}

// store_total is the till total Ops entered, in pounds.
// amount_captured = min(round to pence of store × 1.05, hold).
// overrun_amount = max(0, that gross − amount_captured). Plentry covers it.
// fee_amount = amount_captured − store_total. This is the 5% when the gross
// fits in the hold, less when the hold caps it, and negative when the till
// itself is above the hold.
export function captureSplit(storeGbp: number, holdGbp: number): CaptureSplit {
  const storePence = Math.round(Number(storeGbp) * 100)
  const holdPence = Math.round(Number(holdGbp) * 100)
  const grossPence = grossPenceFromStore(storePence)
  const capturedPence = Math.min(grossPence, holdPence)
  const store_total = storePence / 100
  const hold = holdPence / 100
  const gross = grossPence / 100
  const amount_captured = capturedPence / 100
  const overrun_amount = Math.max(0, grossPence - capturedPence) / 100
  const fee_amount = (capturedPence - storePence) / 100
  return { store_total, amount_captured, fee_amount, overrun_amount, gross, hold }
}

// Penny check in integer pence: Math.round(storePence * 105 / 100), then min
// with the hold in pence. Same rounding as captureSplit. A drift alerts; it
// does not block the capture.
export function splitAssertOk(split: { store_total: number; amount_captured: number; hold: number }): boolean {
  const storePence = Math.round(Number(split.store_total) * 100)
  const holdPence = Math.round(Number(split.hold) * 100)
  const capturedPence = Math.round(Number(split.amount_captured) * 100)
  if (!Number.isFinite(storePence) || !Number.isFinite(holdPence) || !Number.isFinite(capturedPence)) return false
  const expected = Math.min(grossPenceFromStore(storePence), holdPence)
  return capturedPence === expected
}

export function tillGbp(amountGbp: unknown): number | null {
  const pence = Math.round(Number(amountGbp) * 100)
  if (!Number.isFinite(pence) || pence <= 0) return null
  return pence / 100
}

export type OrderMoneyRow = {
  id: number | string
  payment_intent: string | null
  amount_held: number | string | null
  payment_status: string | null
  amount_captured?: number | string | null
}

export type StripeResult = { ok: boolean; j: any }

export type OrderUpdate = { error: unknown; rows?: number }

type Alert = (text: string) => Promise<void>
type Log = (message: string, fields: Record<string, unknown>) => void

function errText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error.slice(0, 300)
  const e = error as { message?: string; code?: string }
  return [e.code, e.message].filter(Boolean).join(' ').slice(0, 300)
}

function safeId(v: unknown, max = 80): string {
  const s = String(v ?? '').replace(/[^\w.-]/g, '').slice(0, max)
  return s || '?'
}

function money(n: number): string {
  return (Math.round(Number(n) * 100) / 100).toFixed(2)
}

const SPLIT_COLUMNS = ['store_total', 'fee_amount', 'overrun_amount'] as const

function isUndefinedColumn(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === '42703'
}

function patchHasSplit(patch: Record<string, unknown>): boolean {
  return SPLIT_COLUMNS.some((key) => Object.prototype.hasOwnProperty.call(patch, key))
}

function withoutSplit(patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...patch }
  for (const key of SPLIT_COLUMNS) delete next[key]
  return next
}

async function notify(alert: Alert, text: string) {
  try {
    await alert(text)
  } catch {
    // The caller logs Telegram failures. A failed alert must not hide the DB error.
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function writeOrder(
  updateOrder: (id: number | string, patch: Record<string, unknown>) => Promise<OrderUpdate>,
  id: number | string,
  patch: Record<string, unknown>,
  alert: Alert,
  log: Log,
  sleep: (ms: number) => Promise<void>,
  paymentIntent: string,
  amountCaptured: number,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  let last = 'update failed'
  let writing = patch
  let droppedSplit = false
  for (let attempt = 0; attempt < CAPTURE_DB_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1] ?? 800)
    try {
      let res = await updateOrder(id, writing)
      // Missing split columns (pay deployed before the SQL). The full patch
      // cannot succeed. Save amount_captured and payment_status without it.
      if (!droppedSplit && isUndefinedColumn(res.error) && patchHasSplit(writing)) {
        writing = withoutSplit(writing)
        droppedSplit = true
        res = await updateOrder(id, writing)
      }
      const missed = res.rows === 0
      if (!res.error && !missed) {
        if (droppedSplit) {
          log('pay capture: split columns missing', {
            order_id: safeId(id),
            payment_intent: safeId(paymentIntent),
            amount_captured: money(amountCaptured),
            error: '42703',
          })
          await notify(
            alert,
            `Plentry capture: order #${safeId(id)} PaymentIntent ${safeId(paymentIntent)} captured £${money(amountCaptured)} but the split wasn't recorded because the columns are missing.`,
          )
        }
        return { ok: true }
      }
      last = errText(res.error) || (missed ? 'no row updated' : 'update failed')
    } catch (e) {
      last = errText(e) || 'update failed'
    }
  }
  log('pay capture: orders update failed', {
    order_id: safeId(id),
    payment_intent: safeId(paymentIntent),
    amount_captured: money(amountCaptured),
    error: last,
  })
  await notify(
    alert,
    `Plentry capture: order #${safeId(id)} PaymentIntent ${safeId(paymentIntent)} captured £${money(amountCaptured)} but the orders row did not update.`,
  )
  return {
    ok: false,
    detail: `Stripe captured £${money(amountCaptured)} but the order row did not save. Try again — a retry repairs the row.`,
  }
}

export async function runCapture(opts: {
  order: OrderMoneyRow | null
  amountGbp: unknown
  stripeGet: (paymentIntentId: string) => Promise<StripeResult>
  stripeCapture: (paymentIntentId: string, amountToCapturePence: number) => Promise<StripeResult>
  updateOrder: (id: number | string, patch: Record<string, unknown>) => Promise<OrderUpdate>
  alert: Alert
  sleep?: (ms: number) => Promise<void>
  log?: Log
  computeSplit?: (storeGbp: number, holdGbp: number) => CaptureSplit
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const order = opts.order
  const alert = opts.alert
  const sleep = opts.sleep || defaultSleep
  const log = opts.log || ((message, fields) => console.error(message, fields))
  const compute = opts.computeSplit || captureSplit
  if (!order?.payment_intent) return { status: 400, body: { error: 'no payment intent on order' } }
  if (order.payment_status !== 'authorized') {
    return { status: 400, body: { error: `status is ${order.payment_status}` } }
  }
  const heldPence = Math.round(Number(order.amount_held) * 100)
  if (!Number.isFinite(heldPence) || heldPence <= 0) {
    return { status: 400, body: { error: 'no hold recorded on order' } }
  }
  const hold = heldPence / 100
  const pi = String(order.payment_intent)
  const got = await opts.stripeGet(pi)
  if (!got.ok) return { status: 502, body: { error: 'stripe', detail: got.j?.error?.message } }

  const status = String(got.j?.status || '')
  if (status === 'succeeded') {
    const received = Number(got.j?.amount_received)
    if (!Number.isFinite(received) || received < 0) {
      return { status: 502, body: { error: 'stripe', detail: 'captured amount missing' } }
    }
    const amountCaptured = received / 100
    const patch: Record<string, unknown> = {
      payment_status: 'captured',
      amount_captured: amountCaptured,
    }
    const till = tillGbp(opts.amountGbp)
    let storeGbp: number | null = null
    let feeGbp: number | null = null
    let overrunGbp: number | null = null
    if (till != null) {
      const base = compute(till, hold)
      const recorded: CaptureSplit = {
        ...base,
        amount_captured: amountCaptured,
        fee_amount: (Math.round(amountCaptured * 100) - Math.round(base.store_total * 100)) / 100,
        overrun_amount: Math.max(0, Math.round(base.gross * 100) - Math.round(amountCaptured * 100)) / 100,
      }
      if (!splitAssertOk(recorded)) {
        await notify(
          alert,
          `Plentry capture check: order #${safeId(order.id)} PaymentIntent ${safeId(pi)} amount_captured £${money(recorded.amount_captured)} does not match min(store £${money(recorded.store_total)} × 1.05, hold £${money(recorded.hold)}). Capture was not blocked.`,
        )
      }
      if (recorded.fee_amount < 0) {
        await notify(
          alert,
          `Plentry capture: order #${safeId(order.id)} PaymentIntent ${safeId(pi)} store £${money(recorded.store_total)} is above the £${money(hold)} hold. fee is negative (£${money(recorded.fee_amount)}). Captured £${money(amountCaptured)}.`,
        )
      }
      patch.store_total = recorded.store_total
      patch.fee_amount = recorded.fee_amount
      patch.overrun_amount = recorded.overrun_amount
      storeGbp = recorded.store_total
      feeGbp = recorded.fee_amount
      overrunGbp = recorded.overrun_amount
    }
    const saved = await writeOrder(opts.updateOrder, order.id, patch, alert, log, sleep, pi, amountCaptured)
    if (!saved.ok) return { status: 500, body: { error: 'capture_not_recorded', detail: saved.detail } }
    return {
      status: 200,
      body: {
        live: true,
        captured_gbp: amountCaptured,
        store_gbp: storeGbp,
        fee_gbp: feeGbp,
        overrun_gbp: overrunGbp,
        already_captured: true,
      },
    }
  }

  if (status !== 'requires_capture') {
    return { status: 400, body: { error: `payment intent is ${status || 'unknown'}` } }
  }
  const till = tillGbp(opts.amountGbp)
  if (till == null) return { status: 400, body: { error: 'bad amount' } }
  const split = compute(till, hold)
  if (!splitAssertOk(split)) {
    await notify(
      alert,
      `Plentry capture check: order #${safeId(order.id)} PaymentIntent ${safeId(pi)} amount_captured £${money(split.amount_captured)} does not match min(store £${money(split.store_total)} × 1.05, hold £${money(split.hold)}). Capture was not blocked.`,
    )
  }
  if (split.fee_amount < 0) {
    await notify(
      alert,
      `Plentry capture: order #${safeId(order.id)} PaymentIntent ${safeId(pi)} store £${money(split.store_total)} is above the £${money(hold)} hold. fee is negative (£${money(split.fee_amount)}). Captured £${money(split.amount_captured)}.`,
    )
  }
  const pence = Math.round(split.amount_captured * 100)
  const cap = await opts.stripeCapture(pi, pence)
  if (!cap.ok) return { status: 502, body: { error: 'stripe', detail: cap.j?.error?.message } }
  const patch = {
    payment_status: 'captured',
    amount_captured: split.amount_captured,
    store_total: split.store_total,
    fee_amount: split.fee_amount,
    overrun_amount: split.overrun_amount,
  }
  const saved = await writeOrder(opts.updateOrder, order.id, patch, alert, log, sleep, pi, split.amount_captured)
  if (!saved.ok) return { status: 500, body: { error: 'capture_not_recorded', detail: saved.detail } }
  return {
    status: 200,
    body: {
      live: true,
      captured_gbp: split.amount_captured,
      store_gbp: split.store_total,
      fee_gbp: split.fee_amount,
      overrun_gbp: split.overrun_amount,
      already_captured: false,
    },
  }
}

export async function runReconcile(opts: {
  rows: OrderMoneyRow[]
  dryRun: boolean
  stripeGet: (paymentIntentId: string) => Promise<StripeResult>
  updateOrder: (id: number | string, patch: Record<string, unknown>) => Promise<OrderUpdate>
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const updates: Record<string, unknown>[] = []
  const errors: Record<string, unknown>[] = []
  for (const row of opts.rows) {
    if (row.amount_captured != null || !row.payment_intent) continue
    const pi = String(row.payment_intent)
    const got = await opts.stripeGet(pi)
    if (!got.ok) {
      errors.push({ id: row.id, payment_intent: safeId(pi), error: 'stripe' })
      continue
    }
    if (String(got.j?.status || '') !== 'succeeded') continue
    const received = Number(got.j?.amount_received)
    if (!Number.isFinite(received) || received < 0) {
      errors.push({ id: row.id, payment_intent: safeId(pi), error: 'captured amount missing' })
      continue
    }
    const amount = received / 100
    const patch = { payment_status: 'captured', amount_captured: amount }
    if (!opts.dryRun) {
      const res = await opts.updateOrder(row.id, patch)
      if (res.error || res.rows === 0) {
        errors.push({ id: row.id, payment_intent: safeId(pi), error: errText(res.error) || 'no row updated' })
        continue
      }
    }
    updates.push({
      id: row.id,
      payment_intent: pi,
      amount_captured: amount,
      payment_status: 'captured',
      wrote: !opts.dryRun,
    })
  }
  return {
    status: 200,
    body: { live: true, dryRun: opts.dryRun, checked: opts.rows.length, updates, errors },
  }
}
