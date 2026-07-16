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
    const htmlWithoutExtra = buildTransactionEmailHtml({
      transactionId: "tx-789",
      type: "EXCHANGE",
      status: "COMPLETED",
      amountInCents: 1000,
      currency: "EUR",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
    });

    const htmlWithExtra = buildTransactionEmailHtml({
      transactionId: "tx-789",
      type: "EXCHANGE",
      status: "COMPLETED",
      amountInCents: 1000,
      currency: "EUR",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
      extraRows: [{ label: "Filler Row Marker", value: "xyz" }],
    });

    expect(htmlWithoutExtra).toContain("Cambio de divisa");
    expect(htmlWithoutExtra).not.toContain("Filler Row Marker");
    expect(htmlWithExtra).toContain("Filler Row Marker");
  });

  it("escapa valores interpolados para prevenir XSS", () => {
    const html = buildTransactionEmailHtml({
      transactionId: "<script>alert(1)</script>",
      type: "DEPOSIT",
      status: "<img src=x onerror='alert(2)'>",
      amountInCents: 150000,
      currency: "USD",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
      extraRows: [
        { label: "<b>Bold</b>", value: "<svg onload='alert(3)'>" }
      ],
    });

    // Verify dangerous content is escaped
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>Bold</b>");
    expect(html).toContain("&lt;svg");
    expect(html).not.toContain("<svg onload");
  });

  it("escapa la divisa para prevenir XSS", () => {
    const html = buildTransactionEmailHtml({
      transactionId: "tx-xss-test",
      type: "DEPOSIT",
      status: "COMPLETED",
      amountInCents: 150000,
      currency: "<script>alert(1)</script>",
      occurredAt: new Date("2026-07-15T10:00:00Z"),
    });

    // Verify currency is escaped in both Moneda row and Monto row
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
