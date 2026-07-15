import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/exchange/exchange-rates.repository", () => ({
  getCurrentRate: vi.fn(),
}));
vi.mock("../../src/modules/exchange/exchange.repository", () => ({
  executeExchange: vi.fn(),
  findExistingExchangeTransaction: vi.fn().mockResolvedValue(null),
}));

import { getCurrentRate } from "../../src/modules/exchange/exchange-rates.repository";
import { executeExchange, findExistingExchangeTransaction } from "../../src/modules/exchange/exchange.repository";
import { getQuote, executeExchangeOperation } from "../../src/modules/exchange/exchange.service";

describe("exchange.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calcula el monto destino redondeando centavos", async () => {
    (getCurrentRate as any).mockResolvedValue({ id: "rate-1", rateValue: 0.92 });

    const quote = await getQuote({
      sourceCurrency: "USD",
      targetCurrency: "EUR",
      sourceAmountCents: 10000,
    });

    expect(quote.targetAmountCents).toBe(9200);
    expect(quote.rateValue).toBe(0.92);
  });

  it("lanza RATE_NOT_FOUND si no hay tasa vigente", async () => {
    (getCurrentRate as any).mockResolvedValue(null);

    await expect(
      getQuote({ sourceCurrency: "USD", targetCurrency: "JPY", sourceAmountCents: 1000 })
    ).rejects.toThrow("RATE_NOT_FOUND");
  });

  it("ejecuta la conversion pasando el monto ya calculado al repository", async () => {
    (getCurrentRate as any).mockResolvedValue({ id: "rate-1", rateValue: 0.92 });
    (executeExchange as any).mockResolvedValue({ transactionId: "tx-1" });

    const result = await executeExchangeOperation({
      userId: "user-1",
      walletId: "wallet-1",
      sourceCurrency: "USD",
      targetCurrency: "EUR",
      sourceAmountCents: 10000,
      idempotencyKey: "idemp-1",
    });

    expect(executeExchange).toHaveBeenCalledWith(
      expect.objectContaining({ targetAmountCents: 9200, rateApplied: 0.92 })
    );
    expect(result.transactionId).toBe("tx-1");
  });

  it("propaga INSUFFICIENT_FUNDS del repository", async () => {
    (getCurrentRate as any).mockResolvedValue({ id: "rate-1", rateValue: 0.92 });
    (executeExchange as any).mockRejectedValue(new Error("INSUFFICIENT_FUNDS"));

    await expect(
      executeExchangeOperation({
        userId: "user-1",
        walletId: "wallet-1",
        sourceCurrency: "USD",
        targetCurrency: "EUR",
        sourceAmountCents: 10000,
        idempotencyKey: "idemp-2",
      })
    ).rejects.toThrow("INSUFFICIENT_FUNDS");
  });
});

describe("exchange.service - idempotencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve la transaccion original si la key ya existe con el mismo payload", async () => {
    (findExistingExchangeTransaction as any).mockResolvedValue({
      id: "tx-viejo",
      status: "COMPLETED",
      requestPayload: { source_currency: "USD", target_currency: "EUR", source_amount_cents: 10000 },
      rateApplied: 0.91,
      targetAmountCents: 9100,
    });

    const result = await executeExchangeOperation({
      userId: "user-1",
      walletId: "wallet-1",
      sourceCurrency: "USD",
      targetCurrency: "EUR",
      sourceAmountCents: 10000,
      idempotencyKey: "idemp-repetido",
    });

    expect(result.transactionId).toBe("tx-viejo");
    expect(result.reused).toBe(true);
    expect(result.rateApplied).toBe(0.91);
    expect(result.targetAmountCents).toBe(9100);
    expect(getCurrentRate).not.toHaveBeenCalled();
  });

  it("rechaza con IDEMPOTENCY_KEY_MISMATCH si el payload difiere", async () => {
    (findExistingExchangeTransaction as any).mockResolvedValue({
      id: "tx-viejo",
      status: "COMPLETED",
      requestPayload: { source_currency: "USD", target_currency: "EUR", source_amount_cents: 5000 },
      rateApplied: 0.91,
      targetAmountCents: 4550,
    });

    await expect(
      executeExchangeOperation({
        userId: "user-1",
        walletId: "wallet-1",
        sourceCurrency: "USD",
        targetCurrency: "EUR",
        sourceAmountCents: 10000, // distinto al original
        idempotencyKey: "idemp-repetido",
      })
    ).rejects.toThrow("IDEMPOTENCY_KEY_MISMATCH");
  });

  it("ante IDEMPOTENCY_KEY_CONFLICT (carrera concurrente) relee y devuelve la transaccion ganadora", async () => {
    (findExistingExchangeTransaction as any)
      .mockResolvedValueOnce(null) // chequeo inicial: todavia no existe
      .mockResolvedValueOnce({
        // se relee tras el 23505 -> IDEMPOTENCY_KEY_CONFLICT: otra request ya la inserto
        id: "tx-ganadora",
        status: "COMPLETED",
        requestPayload: { source_currency: "USD", target_currency: "EUR", source_amount_cents: 10000 },
        rateApplied: 0.9,
        targetAmountCents: 9000,
      });
    (getCurrentRate as any).mockResolvedValue({ id: "rate-1", rateValue: 0.9 });
    (executeExchange as any).mockRejectedValue(new Error("IDEMPOTENCY_KEY_CONFLICT"));

    const result = await executeExchangeOperation({
      userId: "user-1",
      walletId: "wallet-1",
      sourceCurrency: "USD",
      targetCurrency: "EUR",
      sourceAmountCents: 10000,
      idempotencyKey: "idemp-carrera",
    });

    expect(result.transactionId).toBe("tx-ganadora");
    expect(result.reused).toBe(true);
    expect(result.rateApplied).toBe(0.9);
  });

  it("si al releer tras IDEMPOTENCY_KEY_CONFLICT el payload no coincide, rechaza con IDEMPOTENCY_KEY_MISMATCH", async () => {
    (findExistingExchangeTransaction as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "tx-ganadora",
        status: "COMPLETED",
        requestPayload: { source_currency: "USD", target_currency: "EUR", source_amount_cents: 5000 },
        rateApplied: 0.9,
        targetAmountCents: 4500,
      });
    (getCurrentRate as any).mockResolvedValue({ id: "rate-1", rateValue: 0.9 });
    (executeExchange as any).mockRejectedValue(new Error("IDEMPOTENCY_KEY_CONFLICT"));

    await expect(
      executeExchangeOperation({
        userId: "user-1",
        walletId: "wallet-1",
        sourceCurrency: "USD",
        targetCurrency: "EUR",
        sourceAmountCents: 10000,
        idempotencyKey: "idemp-carrera-2",
      })
    ).rejects.toThrow("IDEMPOTENCY_KEY_MISMATCH");
  });
});