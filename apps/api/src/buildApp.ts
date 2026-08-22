import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { startAlertEscalationScheduler } from "./jobs/alertEscalationTick.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerEmergencyRoutes } from "./routes/emergency.js";
import { registerHealthRoutes } from "./routes/health.js";
import { createAlertContactsPushNotifier } from "./services/alertNotifications/factory.js";
import { createEmergencyInviteEmailSender } from "./services/email/factory.js";

const STATIC_DIR = resolve(join(import.meta.dirname, "..", "..", "..", "web"));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".enc": "image/jpeg",
};

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
          };
        },
      },
    },
    bodyLimit: 1_048_576,
  });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error("JWT_SECRET must be set (minimum 16 characters)");
  }

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyJwt, {
    secret: jwtSecret,
  });

  await app.register(rateLimit, {
    global: false,
  });

  app.get("/", async () => {
    return {
      message: "ProtectHer API",
      health: "/health",
      docs: "/docs/API.md",
    };
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerAdminRoutes(app);

  const emailSender = createEmergencyInviteEmailSender(app.log);
  const contactsPush = createAlertContactsPushNotifier(app.log);

  await app.register(
    async (scoped) => {
      scoped.addHook("onRequest", async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid or missing token",
            },
          });
        }
      });

      await registerEmergencyRoutes(scoped, emailSender);
    },
    { prefix: "/emergency" },
  );

  await app.register(async (scoped) => {
    scoped.addHook("onRequest", async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or missing token",
          },
        });
      }
    });

    await registerDeviceRoutes(scoped);
    await registerAlertRoutes(scoped, { contactsPush });
  });

  const stopEscalationScheduler = startAlertEscalationScheduler(
    app.log,
    contactsPush,
  );
  app.addHook("onClose", async () => {
    stopEscalationScheduler();
  });

  // Serve static web files (dashboard, landing page, etc.)
  app.get("/web/*", async (request, reply) => {
    const urlPath = (request.params as { "*": string })["*"] || "index.html";
    // Prevent directory traversal
    const safePath = urlPath.replace(/\.\.\//g, "").replace(/^\/+/, "");
    const filePath = join(STATIC_DIR, safePath || "index.html");

    if (!existsSync(filePath) || !filePath.startsWith(STATIC_DIR)) {
      return reply
        .status(404)
        .send({ error: { code: "NOT_FOUND", message: "File not found" } });
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    reply.type(contentType);
    return reply.send(readFileSync(filePath));
  });

  // Redirect root web requests to the dashboard
  app.get("/adm", async (_request, reply) => {
    return reply.redirect("/web/adm.html");
  });

  app.get("/web", async (_request, reply) => {
    return reply.redirect("/web/adm.html");
  });

  return app;
}
