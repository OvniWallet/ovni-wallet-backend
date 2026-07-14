import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/virtual-cards/virtual-cards.repository", () => ({
  findCardsByWallet: vi.fn(),
  createCard: vi.fn(),
  findCardById: vi.fn(),
  blockCard: vi.fn(),
}));

import {
  findCardsByWallet,
  createCard,
  findCardById,
  blockCard,
} from "../../src/modules/virtual-cards/virtual-cards.repository";
import { issueCard, blockCardById, listCards } from "../../src/modules/virtual-cards/virtual-cards.service";

describe("virtual-cards.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista las tarjetas de la wallet", async () => {
    (findCardsByWallet as any).mockResolvedValue([{ id: "card-1" }]);
    const cards = await listCards("wallet-1");
    expect(cards).toHaveLength(1);
  });

  it("permite emitir tarjeta si no se llego al limite", async () => {
    (findCardsByWallet as any).mockResolvedValue([{ id: "card-1" }, { id: "card-2" }]);
    (createCard as any).mockResolvedValue({ id: "card-3" });

    const card = await issueCard("wallet-1", "USD");
    expect(card.id).toBe("card-3");
  });

  it("rechaza emitir tarjeta si ya hay 3 activas", async () => {
    (findCardsByWallet as any).mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);

    await expect(issueCard("wallet-1", "USD")).rejects.toThrow("MAX_CARDS_REACHED");
    expect(createCard).not.toHaveBeenCalled();
  });

  it("no permite bloquear una tarjeta de otra wallet", async () => {
    (findCardById as any).mockResolvedValue({ id: "card-1", walletId: "wallet-otro" });

    await expect(blockCardById("card-1", "wallet-mio")).rejects.toThrow("NOT_OWNER");
    expect(blockCard).not.toHaveBeenCalled();
  });

  it("bloquea correctamente cuando el dueño coincide", async () => {
    (findCardById as any).mockResolvedValue({ id: "card-1", walletId: "wallet-mio" });

    await blockCardById("card-1", "wallet-mio");
    expect(blockCard).toHaveBeenCalledWith("card-1");
  });

  it("lanza CARD_NOT_FOUND si la tarjeta no existe", async () => {
    (findCardById as any).mockResolvedValue(null);

    await expect(blockCardById("card-x", "wallet-mio")).rejects.toThrow("CARD_NOT_FOUND");
  });
});
