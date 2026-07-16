import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/virtual-cards/virtual-cards.repository", () => ({
  findCardById: vi.fn(),
}));
vi.mock("../../src/modules/virtual-cards/card-spend.repository", () => ({
  findExistingTransaction: vi.fn(),
  getBalance: vi.fn(),
  insertDirectCardSpend: vi.fn(),
  insertFailedCardSpend: vi.fn(),
}));
vi.mock("../../src/modules/exchange/exchange.service", () => ({
  getQuote: vi.fn(),
  executeExchangeOperation: vi.fn(),
}));

import { findCardById } from "../../src/modules/virtual-cards/virtual-cards.repository";
import {
  findExistingTransaction,
  getBalance,
  insertDirectCardSpend,
} from "../../src/modules/virtual-cards/card-spend.repository";
import { simulateSpend } from "../../src/modules/virtual-cards/card-spend.service";

const baseParams = {
  cardId: "card-1",
  walletId: "wallet-1",
  userId: "user-1",
  amountCents: 2500,
  currency: "EUR",
  merchantName: "Cafe Central",
  idempotencyKey: "idemp-spend-1",
};

describe("card-spend.service - geolocalizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("incluye latitude y longitude en el metadata del cobro directo", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue({ walletId: "wallet-1", status: "ACTIVE", currencyDefault: "USD" });
    (getBalance as any).mockResolvedValue({ id: "balance-eur", amountCents: 5000 });
    (insertDirectCardSpend as any).mockResolvedValue("tx-directo");

    await simulateSpend({ ...baseParams, latitude: 4.6097, longitude: -74.0817 });

    expect(insertDirectCardSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ latitude: 4.6097, longitude: -74.0817 }),
      })
    );
  });

  it("no incluye coordenadas si no vienen en la peticion", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue({ walletId: "wallet-1", status: "ACTIVE", currencyDefault: "USD" });
    (getBalance as any).mockResolvedValue({ id: "balance-eur", amountCents: 5000 });
    (insertDirectCardSpend as any).mockResolvedValue("tx-directo");

    await simulateSpend(baseParams);

    const call = (insertDirectCardSpend as any).mock.calls[0][0];
    expect(call.metadata.latitude).toBeUndefined();
    expect(call.metadata.longitude).toBeUndefined();
  });
});
