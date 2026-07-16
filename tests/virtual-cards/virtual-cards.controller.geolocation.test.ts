import { describe, it, expect, vi, beforeEach } from "vitest";

const { simulateSpendMock, getWalletIdByUserIdMock, notifyTransactionEmailMock } = vi.hoisted(() => ({
  simulateSpendMock: vi.fn(),
  getWalletIdByUserIdMock: vi.fn(),
  notifyTransactionEmailMock: vi.fn(),
}));

vi.mock("../../src/modules/virtual-cards/virtual-cards.service", () => ({
  listCards: vi.fn(),
  issueCard: vi.fn(),
  blockCardById: vi.fn(),
}));
vi.mock("../../src/modules/virtual-cards/card-spend.service", () => ({
  simulateSpend: simulateSpendMock,
}));
vi.mock("../../src/shared/wallet-lookup", () => ({
  getWalletIdByUserId: getWalletIdByUserIdMock,
}));
vi.mock("../../src/integrations/ses/ses.notifications", () => ({
  notifyTransactionEmail: notifyTransactionEmailMock,
}));

import { simulateSpendController } from "../../src/modules/virtual-cards/virtual-cards.controller";

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("simulateSpendController - geolocalizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWalletIdByUserIdMock.mockResolvedValue("wallet-1");
    simulateSpendMock.mockResolvedValue({ transactionId: "tx-1", status: "COMPLETED", reused: false });
  });

  it("reenvia latitude y longitude al service cuando vienen validas", async () => {
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        card_id: "card-1",
        amount_in_cents: 2000,
        currency: "USD",
        merchant_name: "Kiosco Don Pepe",
        idempotency_key: "idemp-1",
        latitude: 4.6097,
        longitude: -74.0817,
      },
    };
    const res = buildRes();

    await simulateSpendController(req, res);

    expect(simulateSpendMock).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 4.6097, longitude: -74.0817 })
    );
  });

  it("rechaza con 400 si solo viene latitude", async () => {
    const req: any = {
      user: { id: "user-1", email: "user@test.com" },
      body: {
        card_id: "card-1",
        amount_in_cents: 2000,
        currency: "USD",
        merchant_name: "Kiosco Don Pepe",
        idempotency_key: "idemp-1",
        latitude: 4.6097,
      },
    };
    const res = buildRes();

    await simulateSpendController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(simulateSpendMock).not.toHaveBeenCalled();
  });
});
