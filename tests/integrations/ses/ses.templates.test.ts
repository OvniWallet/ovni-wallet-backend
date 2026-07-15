import { describe, it, expect } from "vitest";
import { buildTransactionEmailHtml } from "../../../src/integrations/ses/ses.templates";

describe("ses.templates - buildTransactionEmailHtml", () => {
  it("incluye los 6 campos obligatorios en el HTML", () => {
    const html = buildTransactionEmailHtml({
      transactionId: "tx-123",
      type: "DEPOSIT",
      status: "COMPLETED",
      amountInCents: 150000,
      currency: "USD",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
    });

    expect(html).toContain("1500.00 USD"); // Monto
    expect(html).toContain(">USD<"); // Moneda
    expect(html).toContain("tx-123"); // ID de transacción
    expect(html).toContain("Depósito"); // Tipo de operación
    expect(html).toContain("COMPLETED"); // Estado
    expect(html.length).toBeGreaterThan(0);
  });

  it("agrega filas extra cuando se proveen", () => {
    const html = buildTransactionEmailHtml({
      transactionId: "tx-456",
      type: "CARD_SPEND",
      status: "COMPLETED",
      amountInCents: 2000,
      currency: "USD",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
      extraRows: [{ label: "Comercio", value: "Kiosco Don Pepe" }],
    });

    expect(html).toContain("Comercio");
    expect(html).toContain("Kiosco Don Pepe");
  });

  it("no incluye una seccion de filas extra si no se proveen", () => {
    const html = buildTransactionEmailHtml({
      transactionId: "tx-789",
      type: "EXCHANGE",
      status: "COMPLETED",
      amountInCents: 1000,
      currency: "EUR",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
    });

    expect(html).toContain("Cambio de divisa");
  });
});
