import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/db/pool", () => ({
  pool: { query: vi.fn(), connect: vi.fn(), on: vi.fn() },
  testDatabaseConnection: vi.fn(),
}));

import app from "../../src/app";

describe("rutas protegidas - integracion", () => {
  it("GET /exchange/quote sin token responde 401", async () => {
    const res = await request(app).get(
      "/api/v1/exchange/quote?source_currency=USD&target_currency=EUR&source_amount_cents=1000"
    );
    expect(res.status).toBe(401);
  });

  it("POST /virtual-cards sin token responde 401", async () => {
    const res = await request(app).post("/api/v1/virtual-cards").send({ currency_default: "USD" });
    expect(res.status).toBe(401);
  });

  it("POST /chatbot/query sin token responde 401", async () => {
    const res = await request(app).post("/api/v1/chatbot/query").send({ message: "hola" });
    expect(res.status).toBe(401);
  });

  it("POST /virtual-cards/simulate-spend sin token responde 401", async () => {
    const res = await request(app).post("/api/v1/virtual-cards/simulate-spend").send({});
    expect(res.status).toBe(401);
  });
});
