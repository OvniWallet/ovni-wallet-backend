import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { financialRateLimiter } from "../../src/middlewares/rate-limit.middleware";

function buildTestApp(max: number) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { sub: "user-fijo-para-el-test" };
    next();
  });
  app.use(financialRateLimiter);
  app.get("/ping", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("financialRateLimiter", () => {
  it("permite pedidos por debajo del limite", async () => {
    const app = buildTestApp(15);
    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
  });

  it("bloquea con 429 al superar el limite (15 por minuto)", async () => {
    const app = buildTestApp(15);

    for (let i = 0; i < 15; i++) {
      await request(app).get("/ping");
    }

    const res = await request(app).get("/ping");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("TOO_MANY_REQUESTS");
  });
});