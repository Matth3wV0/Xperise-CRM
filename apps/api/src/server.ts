import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import cron from "node-cron";
import { authRoutes } from "./modules/auth/auth.routes";
import { contactRoutes } from "./modules/contacts/contacts.routes";
import { companyRoutes } from "./modules/companies/companies.routes";
import { pipelineRoutes } from "./modules/pipelines/pipelines.routes";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes";
import { actionRoutes } from "./modules/actions/actions.routes";
import { importRoutes } from "./modules/import/import.routes";
import { notificationRoutes } from "./modules/notifications/notifications.routes";
import { telegramRoutes } from "./modules/telegram/telegram.routes";
import { apolloRoutes } from "./modules/apollo/apollo.routes";
import { campaignRoutes } from "./modules/campaigns/campaign.routes";
import { agentRoutes } from "./modules/ai-agents/agent.routes";
import { pollApolloEmailStats } from "./cron/poll-apollo-emails";

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport:
      process.env.NODE_ENV === "development"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

async function start() {
  // Plugins
  await server.register(helmet);
  await server.register(cors, {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  });
  await server.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });
  await server.register(jwt, {
    secret: process.env.JWT_SECRET || "xperise-dev-secret-change-in-production",
    sign: { expiresIn: "7d" },
  });

  // Routes
  await server.register(authRoutes, { prefix: "/auth" });
  await server.register(contactRoutes, { prefix: "/contacts" });
  await server.register(companyRoutes, { prefix: "/companies" });
  await server.register(pipelineRoutes, { prefix: "/pipelines" });
  await server.register(dashboardRoutes, { prefix: "/dashboard" });
  await server.register(actionRoutes, { prefix: "/contacts" });
  await server.register(importRoutes, { prefix: "/import" });
  await server.register(notificationRoutes, { prefix: "/notifications" });
  await server.register(telegramRoutes, { prefix: "/telegram" });
  await server.register(apolloRoutes, { prefix: "/apollo" });
  await server.register(campaignRoutes, { prefix: "/campaigns" });
  await server.register(agentRoutes, { prefix: "/ai-agents" });

  // Health check
  server.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  const port = Number(process.env.PORT) || 4000;
  const host = process.env.HOST || "0.0.0.0";

  try {
    await server.listen({ port, host });
    server.log.info(`Server running at http://${host}:${port}`);

    // Apollo email stats polling — every 30 minutes
    if (process.env.APOLLO_API_KEY) {
      cron.schedule("*/30 * * * *", () => {
        pollApolloEmailStats().catch((err) =>
          server.log.error("[apollo-poll] Cron error:", err)
        );
      });
      server.log.info("Apollo email stats polling cron scheduled (every 30 min)");
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
