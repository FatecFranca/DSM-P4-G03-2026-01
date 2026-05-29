import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { startAlertEscalationScheduler } from "./jobs/alertEscalationTick.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerEmergencyRoutes } from "./routes/emergency.js";
import { registerHealthRoutes } from "./routes/health.js";
import { createAlertContactsPushNotifier } from "./services/alertNotifications/factory.js";
import { createEmergencyInviteEmailSender } from "./services/email/factory.js";

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
  await registerDashboardRoutes(app);

  // --- serve arquivos estáticos da pasta web/ ---
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = normalize(join(__filename, ".."));
  const webRoot = resolve(__dirname, "..", "..", "..", "web");

  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  };

  app.get("/*", async (request, reply) => {
    // só responde a paths que parecem arquivo (têm extensão) ou são raiz ""
    const reqPath = (request.params as { "*": string })["*"] ?? "";
    const fileName = reqPath === "" ? "index.html" : reqPath;

    // bloqueia path traversal
    const safe = normalize(fileName);
    if (safe.startsWith("..") || safe.includes("~")) {
      return reply.status(400).send("Bad request");
    }

    const absolute = join(webRoot, safe);

    try {
      await access(absolute);
      const stats = await stat(absolute);
      if (!stats.isFile()) {
        return reply.status(404).send("Not found");
      }

      const ext = extname(absolute).toLowerCase();
      const contentType = MIME[ext] ?? "application/octet-stream";

      reply.header("content-type", contentType);
      return reply.send(createReadStream(absolute));
    } catch {
      // deixa o Fastify seguir para a próxima rota (API)
      return reply.status(404).send("Not found");
    }
  });

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

  return app;
}