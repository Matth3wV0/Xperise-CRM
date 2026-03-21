import "dotenv/config";
import { bot } from "./bot.js";
import { setupCrons } from "./cron/index.js";

async function main() {
  setupCrons(bot);

  await bot.start({
    onStart: (info) => {
      console.log(`Xperise BD Bot started as @${info.username}`);
      console.log(`Bot ID: ${info.id}`);
    },
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
