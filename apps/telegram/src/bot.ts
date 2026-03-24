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
import { handleCampaign } from "./handlers/campaign.js";
import { handleAi } from "./handlers/ai.js";
import { handleBrief } from "./handlers/brief.js";
import { handleDraft } from "./handlers/draft.js";
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

// ── Campaign stats + approval ────────────────────────────────────────────────
bot.command("campaign", handleCampaign);
bot.command("approve", handleApprove);
bot.command("reject", handleReject);

// ── AI commands (Phase 3) ────────────────────────────────────────────────────
bot.command("ai", handleAi);
bot.command("brief", handleBrief);
bot.command("draft", handleDraft);

// ── Group message handler: [Company] note pattern ───────────────────────────
bot.on("message:text", handleGroupMessage);

// ── Inline keyboard callbacks ───────────────────────────────────────────────
bot.on("callback_query:data", handleCallback);

// ── Error handler ────────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error(`Grammy error [${err.ctx.update.update_id}]:`, err.error);
});
