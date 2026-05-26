import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { alerts, bleDevices, users } from "../db/schema.js";

export async function registerDashboardRoutes(app: FastifyInstance) {

  app.get("/dashboard/stats", async () => {
    const [usersCount, alertsCount, devicesCount] = await Promise.all([
      db.$count(users),
      db.$count(alerts),
      db.$count(bleDevices),
    ]);

    return {
      users: usersCount,
      alerts: alertsCount,
      devices: devicesCount,
    };
  });

}