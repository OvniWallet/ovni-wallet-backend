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
  insertFailedCardSpend,
} from "../../src/modules/virtual-cards/card-spend.repository";
import { getQuote, executeExchangeOperation } from "../../src/modules/exchange/exchange.service";
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

describe("card-spend.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve la transaccion original si la idempotency_key ya existe", async () => {
    (findExistingTransaction as any).mockResolvedValue({ id: "tx-viejo", status: "COMPLETED" });

    const result = await simulateSpend(baseParams);

    expect(result).toEqual({ transactionId: "tx-viejo", status: "COMPLETED", reused: true });
    expect(findCardById).not.toHaveBeenCalled();
  });

  it("rechaza si la tarjeta no existe", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue(null);

    await expect(simulateSpend(baseParams)).rejects.toThrow("CARD_NOT_FOUND");
  });

  it("rechaza si la tarjeta no pertenece a la wallet", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue({ walletId: "otra-wallet", status: "ACTIVE" });

    await expect(simulateSpend(baseParams)).rejects.toThrow("NOT_OWNER");
  });

  it("rechaza si la tarjeta esta bloqueada", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue({ walletId: "wallet-1", status: "BLOCKED" });

    await expect(simulateSpend(baseParams)).rejects.toThrow("CARD_BLOCKED");
  });

  it("cobra directo si hay saldo suficiente en la divisa de la compra", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue({ walletId: "wallet-1", status: "ACTIVE", currencyDefault: "USD" });
    (getBalance as any).mockResolvedValue({ id: "balance-eur", amountCents: 5000 });
    (insertDirectCardSpend as any).mockResolvedValue("tx-directo");

    const result = await simulateSpend(baseParams);

    expect(result).toEqual({ transactionId: "tx-directo", status: "COMPLETED", reused: false });
    expect(executeExchangeOperation).not.toHaveBeenCalled();
  });

  it("convierte desde la divisa default cuando no alcanza en la divisa de cobro", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue({ walletId: "wallet-1", status: "ACTIVE", currencyDefault: "USD" });

    // primer llamado: balance EUR insuficiente. segundo: balance USD default. tercero: balance EUR ya convertido.
    (getBalance as any)
      .mockResolvedValueOnce({ id: "balance-eur", amountCents: 0 })
      .mockResolvedValueOnce({ id: "balance-usd", amountCents: 10000 })
      .mockResolvedValueOnce({ id: "balance-eur", amountCents: 2500 });

    (getQuote as any).mockResolvedValue({ rateValue: 1.08, targetAmountCents: 2700 });
    (executeExchangeOperation as any).mockResolvedValue({ transactionId: "tx-exchange" });
    (insertDirectCardSpend as any).mockResolvedValue("tx-spend-convertido");

    const result = await simulateSpend(baseParams);

    expect(executeExchangeOperation).toHaveBeenCalledWith(
      expect.objectContaining({ sourceCurrency: "USD", targetCurrency: "EUR", sourceAmountCents: 2700 })
    );
    expect(result).toEqual({ transactionId: "tx-spend-convertido", status: "COMPLETED", reused: false });
  });

  it("falla si ninguna divisa cubre el monto", async () => {
    (findExistingTransaction as any).mockResolvedValue(null);
    (findCardById as any).mockResolvedValue({ walletId: "wallet-1", status: "ACTIVE", currencyDefault: "USD" });
    (getBalance as any).mockResolvedValue({ id: "balance-x", amountCents: 0 });
    (getQuote as any).mockResolvedValue({ rateValue: 1.08, targetAmountCents: 2700 });

    await expect(simulateSpend(baseParams)).rejects.toThrow("INSUFFICIENT_FUNDS");
    expect(insertFailedCardSpend).toHaveBeenCalled();
  });
});
