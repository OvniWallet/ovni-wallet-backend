import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/chatbot/chatbot.aggregator", () => ({
  buildFinancialContext: vi.fn(),
}));
vi.mock("../../src/integrations/gemini/gemini.client", () => ({
  askGemini: vi.fn(),
}));

import { buildFinancialContext } from "../../src/modules/chatbot/chatbot.aggregator";
import { askGemini } from "../../src/integrations/gemini/gemini.client";
import { processChatQuery } from "../../src/modules/chatbot/chatbot.service";

describe("chatbot.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("arma el contexto y se lo pasa a gemini junto con el mensaje", async () => {
    (buildFinancialContext as any).mockResolvedValue("Balances: USD 100.00");
    (askGemini as any).mockResolvedValue("Tenes 100 dolares");

    const result = await processChatQuery("user-1", "wallet-1", "cuanto tengo?");

    expect(buildFinancialContext).toHaveBeenCalledWith("user-1", "wallet-1");
    expect(askGemini).toHaveBeenCalledWith("cuanto tengo?", "Balances: USD 100.00");
    expect(result.reply).toBe("Tenes 100 dolares");
  });

  it("propaga el error si gemini falla", async () => {
    (buildFinancialContext as any).mockResolvedValue("Balances: USD 100.00");
    (askGemini as any).mockRejectedValue(new Error("gemini caido"));

    await expect(processChatQuery("user-1", "wallet-1", "hola")).rejects.toThrow("gemini caido");
  });
});