import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
  SendEmailCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

import { sendEmail } from "../../../src/integrations/ses/ses.client";

describe("ses.client - sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({});
  });

  it("envia un SendEmailCommand con destinatario, asunto y HTML correctos", async () => {
    await sendEmail("dest@test.com", "Asunto de prueba", "<p>Hola</p>");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [command] = sendMock.mock.calls[0];
    expect(command.input.Destination.ToAddresses).toEqual(["dest@test.com"]);
    expect(command.input.Message.Subject.Data).toBe("Asunto de prueba");
    expect(command.input.Message.Body.Html.Data).toBe("<p>Hola</p>");
  });

  it("propaga el error si el envio por SES falla", async () => {
    sendMock.mockRejectedValue(new Error("SES no disponible"));

    await expect(sendEmail("dest@test.com", "Asunto", "<p>Hola</p>")).rejects.toThrow(
      "SES no disponible"
    );
  });
});
