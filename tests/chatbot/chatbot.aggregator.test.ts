import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/db/pool", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "../../src/db/pool";
import { buildFinancialContext } from "../../src/modules/chatbot/chatbot.aggregator";

describe("chatbot.aggregator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("arma un resumen con balances y gastos del mes", async () => {
    (pool.query as any)
      .mockResolvedValueOnce({ rows: [{ timezone: "America/Argentina/Buenos_Aires" }] }) // timezone
      .mockResolvedValueOnce({ rows: [{ currency: "USD", amount_in_cents: 150000 }] }) // balances
      .mockResolvedValueOnce({ rows: [{ currency: "USD", total_cents: 5000, cantidad: 2 }] }); // gastos

    const context = await buildFinancialContext("user-1", "wallet-1");

    expect(context).toContain("USD: 1500.00");
    expect(context).toContain("USD: 50.00 en 2 compras");
  });

  it("usa UTC como fallback si el usuario no tiene timezone", async () => {
    (pool.query as any)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const context = await buildFinancialContext("user-1", "wallet-1");

    expect(context).toContain("sin gastos con tarjeta este mes");
    expect(pool.query).toHaveBeenNthCalledWith(3, expect.any(String), ["wallet-1", "UTC"]);
  });
});
