import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { startAlertEscalationScheduler } from "./jobs/alertEscalationTick.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerAuthRoutes } from "./routes/auth.js";
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
