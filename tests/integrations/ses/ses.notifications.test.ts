import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/integrations/ses/ses.client");
vi.mock("../../../src/config/logger");

import { notifyTransactionEmail } from "../../../src/integrations/ses/ses.notifications";
import { sendEmail } from "../../../src/integrations/ses/ses.client";
import { logger } from "../../../src/config/logger";

const sendEmailMock = vi.mocked(sendEmail);
const loggerWarnMock = vi.mocked(logger.warn);

describe("ses.notifications - notifyTransactionEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia el correo con el asunto correcto segun el tipo de operacion", async () => {
    sendEmailMock.mockResolvedValue(undefined);

    await notifyTransactionEmail({
      toEmail: "user@test.com",
      transactionId: "tx-1",
      type: "DEPOSIT",
      status: "COMPLETED",
      amountInCents: 1000,
      currency: "USD",
      occurredAt: new Date(),
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmailMock.mock.calls[0];
    expect(to).toBe("user@test.com");
    expect(subject).toContain("depósito");
    expect(html).toContain("tx-1");
  });

  it("no relanza el error si SES falla, y loguea con warn", async () => {
    sendEmailMock.mockRejectedValue(new Error("SES no disponible"));

    await expect(
      notifyTransactionEmail({
        toEmail: "user@test.com",
        transactionId: "tx-2",
        type: "P2P_TRANSFER",
        status: "COMPLETED",
        amountInCents: 500,
        currency: "EUR",
        occurredAt: new Date(),
      })
    ).resolves.toBeUndefined();

    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock.mock.calls[0][0]).toContain("correo");
    expect(loggerWarnMock.mock.calls[0][1]).toMatchObject({ transactionId: "tx-2" });
  });
});
