/**
 * Send a message to the BD Telegram group via Bot API.
 * Used by API routes that need to notify the team (campaign launch, alerts).
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_GROUP_CHAT_ID env vars.
 */
export async function sendTelegramMessage(
  text: string,
  options?: {
    chatId?: string;
    inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
  }
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options?.chatId ?? process.env.TELEGRAM_GROUP_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[telegram-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_GROUP_CHAT_ID not set — skipping.");
    return;
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };

  if (options?.inlineKeyboard) {
    body.reply_markup = { inline_keyboard: options.inlineKeyboard };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`[telegram-notify] Failed to send message: ${err}`);
    }
  } catch (err) {
    console.error("[telegram-notify] Fetch error:", err);
  }
}
