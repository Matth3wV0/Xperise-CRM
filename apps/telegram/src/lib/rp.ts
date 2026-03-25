import type { Context } from "grammy";

/** Returns reply_parameters so ctx.reply() quotes the triggering message.
 *
 * Usage:
 *   await ctx.reply(text, { ...rp(ctx), parse_mode: "HTML" });
 */
export function rp(ctx: Context): { reply_parameters?: { message_id: number } } {
  const message_id = ctx.message?.message_id;
  return message_id ? { reply_parameters: { message_id } } : {};
}
