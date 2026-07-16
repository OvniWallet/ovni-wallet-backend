import { describe, it, expect, vi, beforeEach } from "vitest";

const { processDepositMock, notifyTransactionEmailMock } = vi.hoisted(() => ({
  processDepositMock: vi.fn(),
  notifyTransactionEmailMock: vi.fn(),
}));

vi.mock("../../src/modules/transactions/transactions.service", () => ({
  TransactionsService: vi.fn().mockImplementation(() => ({
    processDeposit: processDepositMock,
    getHistory: vi.fn(),
    getTransactionDetail: vi.fn(),
  })),
}));
vi.mock("../../src/integrations/ses/ses.notifications", () => ({
  notifyTransactionEmail: notifyTransactionEmailMock,
}));

import { TransactionsController } from "../../src/modules/transactions/transactions.controller";

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("TransactionsController.deposit - notificacion por email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia el correo de confirmacion tras un deposito nuevo exitoso", async () => {
    processDepositMock.mockResolvedValue({
      transaction_id: "tx-1",
      type: "DEPOSIT",
      status: "COMPLETED",
    });

    const controller = new TransactionsController();
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: { amount_in_cents: 5000, currency: "USD", idempotency_key: "idemp-1" },
    };
    const res = buildRes();
    const next = vi.fn();

    await controller.deposit(req, res, next);

    expect(notifyTransactionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "user@test.com",
        transactionId: "tx-1",
        type: "DEPOSIT",
        status: "COMPLETED",
        amountInCents: 5000,
        currency: "USD",
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("no envia el correo si el deposito es una reutilizacion idempotente", async () => {
    processDepositMock.mockResolvedValue({
      transaction_id: "tx-1",
      type: "DEPOSIT",
      status: "COMPLETED",
      _idempotent_reused: true,
    });

    const controller = new TransactionsController();
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: { amount_in_cents: 5000, currency: "USD", idempotency_key: "idemp-1" },
    };
    const res = buildRes();
    const next = vi.fn();

    await controller.deposit(req, res, next);

    expect(notifyTransactionEmailMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
