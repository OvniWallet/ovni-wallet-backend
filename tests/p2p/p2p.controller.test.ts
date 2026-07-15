import { describe, it, expect, vi, beforeEach } from "vitest";

const { processTransferMock, notifyTransactionEmailMock } = vi.hoisted(() => ({
  processTransferMock: vi.fn(),
  notifyTransactionEmailMock: vi.fn(),
}));

vi.mock("../../src/modules/p2p/p2p.service", () => ({
  P2PService: vi.fn().mockImplementation(() => ({
    processTransfer: processTransferMock,
  })),
}));
vi.mock("../../src/integrations/ses/ses.notifications", () => ({
  notifyTransactionEmail: notifyTransactionEmailMock,
}));

import { P2PController } from "../../src/modules/p2p/p2p.controller";

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("P2PController.transfer - notificacion por email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifica a remitente y destinatario tras una transferencia nueva exitosa", async () => {
    processTransferMock.mockResolvedValue({
      transaction_id: "tx-1",
      amount_transferred: 3000,
      currency: "USD",
    });

    const controller = new P2PController();
    const req: any = {
      user: { id: "user-1", email: "sender@test.com" },
      body: {
        recipient_email: "recipient@test.com",
        amount_in_cents: 3000,
        currency: "USD",
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();
    const next = vi.fn();

    await controller.transfer(req, res, next);

    expect(notifyTransactionEmailMock).toHaveBeenCalledTimes(2);
    expect(notifyTransactionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "sender@test.com", transactionId: "tx-1", type: "P2P_TRANSFER" })
    );
    expect(notifyTransactionEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "recipient@test.com", transactionId: "tx-1", type: "P2P_TRANSFER" })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("no notifica si la transferencia es una reutilizacion idempotente", async () => {
    processTransferMock.mockResolvedValue({
      transaction_id: "tx-1",
      amount_transferred: 3000,
      currency: "USD",
      _idempotent_reused: true,
    });

    const controller = new P2PController();
    const req: any = {
      user: { id: "user-1", email: "sender@test.com" },
      body: {
        recipient_email: "recipient@test.com",
        amount_in_cents: 3000,
        currency: "USD",
        idempotency_key: "idemp-1",
      },
    };
    const res = buildRes();
    const next = vi.fn();

    await controller.transfer(req, res, next);

    expect(notifyTransactionEmailMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
