import { describe, it, expect, vi, beforeEach } from "vitest";

const { executeExchangeOperationMock, getWalletIdByUserIdMock, notifyTransactionEmailMock } = vi.hoisted(() => ({
  executeExchangeOperationMock: vi.fn(),
  getWalletIdByUserIdMock: vi.fn(),
  notifyTransactionEmailMock: vi.fn(),
}));

vi.mock("../../src/modules/exchange/exchange.service", () => ({
  getQuote: vi.fn(),
  executeExchangeOperation: executeExchangeOperationMock,
}));
vi.mock("../../src/shared/wallet-lookup", () => ({
  getWalletIdByUserId: getWalletIdByUserIdMock,
}));
vi.mock("../../src/integrations/ses/ses.notifications", () => ({
  notifyTransactionEmail: notifyTransactionEmailMock,
}));

import { postExchangeController } from "../../src/modules/exchange/exchange.controller";

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("postExchangeController - geolocalizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWalletIdByUserIdMock.mockResolvedValue("wallet-1");
    executeExchangeOperationMock.mockResolvedValue({
      transactionId: "tx-1",
      rateApplied: 0.92,
      targetAmountCents: 9200,
      reused: false,
    });
  });

  it("reenvia latitude y longitude al service cuando vienen validas", async () => {
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        source_currency: "USD",
        target_currency: "EUR",
        source_amount_cents: 10000,
        idempotency_key: "idemp-1",
        latitude: 4.6097,
        longitude: -74.0817,
      },
    };
    const res = buildRes();

    await postExchangeController(req, res);

    expect(executeExchangeOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 4.6097, longitude: -74.0817 })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rechaza con 400 si solo viene longitude", async () => {
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        source_currency: "USD",
        target_currency: "EUR",
        source_amount_cents: 10000,
        idempotency_key: "idemp-1",
        longitude: -74.0817,
      },
    };
    const res = buildRes();

    await postExchangeController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(executeExchangeOperationMock).not.toHaveBeenCalled();
  });
});
