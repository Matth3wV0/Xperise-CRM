import { Bot } from "grammy";
import { handleStart } from "./handlers/start.js";
import { handleBind } from "./handlers/bind.js";
import { handleStatus } from "./handlers/status.js";
import { handleMine } from "./handlers/mine.js";
import { handleCold } from "./handlers/cold.js";
import { handleGroupMessage } from "./handlers/message.js";
import { handleCallback } from "./handlers/callback.js";
import { handleFind } from "./handlers/find.js";
import { handleApprove, handleReject } from "./handlers/approve.js";
import { HELP_TEXT } from "./lib/formatter.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

export const bot = new Bot(token);

// ── Private commands ────────────────────────────────────────────────────────
bot.command("start", handleStart);
bot.command("bind", handleBind);

// ── Query commands (work in group + private) ────────────────────────────────
bot.command("status", handleStatus);
bot.command("mine", handleMine);
bot.command("cold", handleCold);
bot.command("help", async (ctx) => {
  await ctx.reply(HELP_TEXT, { parse_mode: "HTML" });
});

// ── Apollo lead search ───────────────────────────────────────────────────────
bot.command("find", handleFind);

// ── Campaign approval ────────────────────────────────────────────────────────
bot.command("approve", handleApprove);
bot.command("reject", handleReject);

// ── Group message handler: [Company] note pattern ───────────────────────────
bot.on("message:text", handleGroupMessage);

// ── Inline keyboard callbacks ───────────────────────────────────────────────
bot.on("callback_query:data", handleCallback);

// ── Error handler ────────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error(`Grammy error [${err.ctx.update.update_id}]:`, err.error);
});
