// Shared Telegram send for ops alerts. Same bot and chat as notify-order.
// Callers pass the env (Deno.env on the edge). This file does not read secrets
// itself and does not log the token or the chat id.

const TELEGRAM_MAX = 4000

export type EnvLike = { get(name: string): string | undefined }

export async function sendTelegram(
  text: string,
  env: EnvLike,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; detail?: string }> {
  const token = env.get('TELEGRAM_BOT_TOKEN')
  const chatId = env.get('TELEGRAM_CHAT_ID')
  if (!token || !chatId) return { ok: false, status: 500, detail: 'telegram not configured' }
  const r = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text ?? '').slice(0, TELEGRAM_MAX),
      disable_web_page_preview: true,
    }),
  })
  if (!r.ok) {
    const t = await r.text()
    return { ok: false, status: 502, detail: t.slice(0, 200) }
  }
  return { ok: true, status: 200 }
}
