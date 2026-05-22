import { HealthResponseSchema } from "@protecther/contracts";
import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/health", async () => {
    return HealthResponseSchema.parse({
      ok: true,
      service: "protecther-api",
      timestamp: new Date().toISOString(),
    });
  });
}
