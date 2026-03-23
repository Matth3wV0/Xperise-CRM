import { prisma } from "@xperise/database";

/**
 * Get the active Telegram group chat ID.
 * Checks DB first (TelegramGroup with isActive=true),
 * falls back to TELEGRAM_GROUP_CHAT_ID env var.
 */
async function getActiveGroupChatId(): Promise<string | null> {
  const activeGroup = await prisma.telegramGroup.findFirst({
    where: { isActive: true },
    select: { chatId: true },
  });

  if (activeGroup) return activeGroup.chatId;

  return process.env.TELEGRAM_GROUP_CHAT_ID ?? null;
}

/**
 * Send a message to the BD Telegram group via Bot API.
 * Used by API routes that need to notify the team (campaign launch, alerts).
 * Requires TELEGRAM_BOT_TOKEN env var. Group chat ID is resolved from DB or env.
 */
export async function sendTelegramMessage(
  text: string,
  options?: {
    chatId?: string;
    inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
  }
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[telegram-notify] TELEGRAM_BOT_TOKEN not set — skipping.");
    return;
  }

  const chatId = options?.chatId ?? (await getActiveGroupChatId());
  if (!chatId) {
    console.warn("[telegram-notify] No active group configured and TELEGRAM_GROUP_CHAT_ID not set — skipping.");
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
