import "dotenv/config";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../buildApp.js";

describe("alerts routes — auth and validation shell", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
      process.env.JWT_SECRET = "vitest-jwt-secret-16chars";
    }
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects POST /alerts/:id/location without JWT", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/alerts/00000000-0000-0000-0000-000000000001/location",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        lat: -23.5,
        lng: -46.6,
        capturedAt: new Date().toISOString(),
      }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects GET /alerts/:id/locations without JWT", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/alerts/00000000-0000-0000-0000-000000000001/locations",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects POST /alerts/:id/ack without JWT", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/alerts/00000000-0000-0000-0000-000000000001/ack",
    });
    expect(res.statusCode).toBe(401);
  });
});
