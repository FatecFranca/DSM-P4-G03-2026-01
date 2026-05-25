import { FastifyInstance } from "fastify";

export async function registerDashboardRoutes(app: FastifyInstance) {

  app.get("/dashboard/stats", async () => {

    return {
      users: 128,
      alerts: 78,
      devices: 55,
    };
  });

}