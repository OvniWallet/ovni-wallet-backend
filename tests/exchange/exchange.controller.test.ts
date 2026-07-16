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

describe("postExchangeController - notificacion por email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWalletIdByUserIdMock.mockResolvedValue("wallet-1");
  });

  it("notifica tras un exchange nuevo exitoso", async () => {
    executeExchangeOperationMock.mockResolvedValue({
      transactionId: "tx-1",
      rateApplied: 0.92,
      targetAmountCents: 9200,
      reused: false,
    });

    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        source_currency: "USD",
        target_currency: "EUR",
        source_amount_cents: 10000,
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();

    await postExchangeController(req, res);

    expect(notifyTransactionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "user@test.com",
        transactionId: "tx-1",
        type: "EXCHANGE",
        amountInCents: 10000,
        currency: "USD",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("no notifica si el exchange es una reutilizacion idempotente", async () => {
    executeExchangeOperationMock.mockResolvedValue({
      transactionId: "tx-1",
      rateApplied: 0.92,
      targetAmountCents: 9200,
      reused: true,
    });

    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        source_currency: "USD",
        target_currency: "EUR",
        source_amount_cents: 10000,
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();

    await postExchangeController(req, res);

    expect(notifyTransactionEmailMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
