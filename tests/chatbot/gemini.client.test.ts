import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContentMock = vi.fn();
const { FakeAbortError } = vi.hoisted(() => ({
  FakeAbortError: class FakeAbortError extends Error {},
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent: generateContentMock }),
  })),
  GoogleGenerativeAIAbortError: FakeAbortError,
}));

import { askGemini } from "../../src/integrations/gemini/gemini.client";

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

describe("gemini.client - resiliencia ante fallos transitorios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("reintenta una vez ante 503 (alta demanda) y devuelve la respuesta si el segundo intento funciona", async () => {
    generateContentMock
      .mockRejectedValueOnce(httpError("503 Service Unavailable", 503))
      .mockResolvedValueOnce({ response: { text: () => "Tenes 100 dolares" } });

    const reply = await askGemini("cuanto tengo?", "Balances: USD 100.00");

    expect(reply).toBe("Tenes 100 dolares");
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it("no reintenta ante errores no transitorios (ej. 400) y propaga de inmediato", async () => {
    generateContentMock.mockRejectedValue(httpError("400 Bad Request", 400));

    await expect(askGemini("hola", "contexto")).rejects.toThrow("400 Bad Request");
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("si se agotan los reintentos ante 503 persistente, propaga el error original", async () => {
    generateContentMock.mockRejectedValue(httpError("503 Service Unavailable", 503));

    await expect(askGemini("hola", "contexto")).rejects.toThrow("503 Service Unavailable");
    expect(generateContentMock).toHaveBeenCalledTimes(3);
  });

  it("reintenta ante un timeout/abort (mismo tratamiento que 503)", async () => {
    generateContentMock
      .mockRejectedValueOnce(new FakeAbortError("Request aborted"))
      .mockResolvedValueOnce({ response: { text: () => "ok tras timeout" } });

    const reply = await askGemini("hola", "contexto");

    expect(reply).toBe("ok tras timeout");
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it("pasa un timeout explicito en requestOptions en cada intento", async () => {
    generateContentMock.mockResolvedValue({ response: { text: () => "ok" } });

    await askGemini("hola", "contexto");

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });
});
