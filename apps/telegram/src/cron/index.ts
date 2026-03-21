import cron from "node-cron";
import type { Bot, Context } from "grammy";
import { sendColdLeadDigest } from "./cold-lead.js";
import { sendWeeklySummary } from "./weekly.js";

export function setupCrons(bot: Bot<Context>) {
  // Daily cold lead digest at 9:00 AM VN time, Mon–Fri
  cron.schedule(
    "0 9 * * 1-5",
    () => {
      sendColdLeadDigest(bot).catch(console.error);
    },
    { timezone: "Asia/Ho_Chi_Minh" }
  );

  // Weekly summary on Friday at 5:00 PM VN time
  cron.schedule(
    "0 17 * * 5",
    () => {
      sendWeeklySummary(bot).catch(console.error);
    },
    { timezone: "Asia/Ho_Chi_Minh" }
  );

  console.log("Cron jobs scheduled: cold-lead (Mon-Fri 9am VN), weekly (Fri 5pm VN)");
}
