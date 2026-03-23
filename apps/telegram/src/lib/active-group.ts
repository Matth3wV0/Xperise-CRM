import { prisma } from "@xperise/database";

/**
 * Get the active Telegram group chat ID.
 * Checks DB first (TelegramGroup with isActive=true),
 * falls back to TELEGRAM_GROUP_CHAT_ID env var.
 */
export async function getActiveGroupChatId(): Promise<string | null> {
  const activeGroup = await prisma.telegramGroup.findFirst({
    where: { isActive: true },
    select: { chatId: true },
  });

  if (activeGroup) return activeGroup.chatId;

  return process.env.TELEGRAM_GROUP_CHAT_ID ?? null;
}
