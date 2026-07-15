import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/exchange/exchange-rates.repository", () => ({
  getCurrentRate: vi.fn(),
}));
vi.mock("../../src/modules/exchange/exchange.repository", () => ({
  executeExchange: vi.fn(),
  findExistingExchangeTransaction: vi.fn().mockResolvedValue(null),
}));

import { getCurrentRate } from "../../src/modules/exchange/exchange-rates.repository";
import { executeExchange } from "../../src/modules/exchange/exchange.repository";
import { executeExchangeOperation } from "../../src/modules/exchange/exchange.service";

describe("exchange.service - geolocalizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reenvia latitude y longitude al repository", async () => {
    (getCurrentRate as any).mockResolvedValue({ id: "rate-1", rateValue: 0.92 });
    (executeExchange as any).mockResolvedValue({ transactionId: "tx-1" });

    await executeExchangeOperation({
      userId: "user-1",
      walletId: "wallet-1",
      sourceCurrency: "USD",
      targetCurrency: "EUR",
      sourceAmountCents: 10000,
      idempotencyKey: "idemp-1",
      latitude: 4.6097,
      longitude: -74.0817,
    });

    expect(executeExchange).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 4.6097, longitude: -74.0817 })
    );
  });
});
