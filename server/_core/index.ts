import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import * as db from "../db";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { startInvoiceFollowUpScheduler } from "../invoiceFollowUp";
import { startGmailSyncScheduler } from "../gmailSyncScheduler";
import { startQuestionTaskReminderScheduler } from "../questionTaskReminder";
import { startRfiReminderScheduler } from "../rfiReminderScheduler";
import { startClickSendBalanceScheduler } from "../clickSendBalanceScheduler";
import { startComplianceReminderScheduler } from "../complianceReminder";
import { startSubcontractorComplianceScan } from "../subcontractorComplianceScan";
import { startFinancialReviewScheduler } from "../financialReviewScan";
import { startProjectRiskScheduler } from "../projectRiskScan";
import { startWeeklyClientUpdateScheduler } from "../weeklyClientUpdateScheduler";
import { startQuietPeriodScheduler } from "../quietPeriodScheduler";
import { startArrivalWatchScheduler } from "../arrivalWatchScheduler";
import { startPODeliveryFollowUpScheduler } from "../poDeliveryFollowUpScheduler";
import { registerSquareWebhook } from "../squareWebhook";
import { registerClickSendWebhook } from "../clickSendWebhook";
import { getSenderNumberStatus } from "../sms";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Cookie parser — required for ctx.req.cookies to work in tRPC procedures
  app.use(cookieParser());
  // Health check for Railway/load balancers
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Dev login bypass: skip OAuth, mint a session directly
  // Enabled in development OR when ALLOW_DEV_LOGIN=true env var is set
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_LOGIN === "true") {
    app.get("/api/dev/login", async (req, res) => {
      const openId = (req.query.openId as string) || "dev-owner";
      const name = (req.query.name as string) || "Dev Owner";
      try {
        await db.upsertUser({ openId, name, email: "dev@localhost", loginMethod: "dev", lastSignedIn: new Date(), role: "admin" });
      } catch { /* DB may not be configured yet — session still works */ }
      const token = await sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
      const opts = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...opts, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    });
    console.log("[Dev] Login bypass available at http://localhost:3000/api/dev/login");
  }
  // Square payment webhook
  registerSquareWebhook(app);
  // ClickSend inbound SMS webhook (STOP/START/HELP + message storage)
  registerClickSendWebhook(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
    // SMS sender number registration diagnostic
    getSenderNumberStatus().then((s) => {
      if (!s) {
        console.warn("[SMS] Could not retrieve sender number status from ClickSend.");
      } else if (s.status === "Decision Pending" || s.description.toLowerCase().includes("pending") || s.description.toLowerCase().includes("progress")) {
        console.warn(`[SMS] ⚠ SENDER NUMBER ${s.number} registration is PENDING (${s.status}). Outbound SMS to US numbers will be blocked until registration is approved. Action: log in to app.clicksend.com → Numbers → complete toll-free verification.`);
      } else {
        console.log(`[SMS] ✓ Sender number ${s.number} status: ${s.status}`);
      }
    }).catch(() => {/* non-fatal */});
    startInvoiceFollowUpScheduler();
    startGmailSyncScheduler();
    startQuestionTaskReminderScheduler();
    startRfiReminderScheduler();
    startClickSendBalanceScheduler();
    startComplianceReminderScheduler();
    startSubcontractorComplianceScan();
    startFinancialReviewScheduler();
    startProjectRiskScheduler();
    startWeeklyClientUpdateScheduler();
    startQuietPeriodScheduler();
    startArrivalWatchScheduler();
    startPODeliveryFollowUpScheduler();
  });
}

startServer().catch(console.error);
