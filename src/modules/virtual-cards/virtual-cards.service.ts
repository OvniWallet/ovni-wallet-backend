import { findCardsByWallet, createCard, findCardById, blockCard, VirtualCard } from "./virtual-cards.repository";

const MAX_CARDS_PER_WALLET = 3;

export async function listCards(walletId: string): Promise<VirtualCard[]> {
  return findCardsByWallet(walletId);
}

export async function issueCard(walletId: string, currencyDefault: string): Promise<VirtualCard> {
  const existing = await findCardsByWallet(walletId);

  if (existing.length >= MAX_CARDS_PER_WALLET) {
    throw new Error("MAX_CARDS_REACHED");
  }

  return createCard(walletId, currencyDefault);
}

export async function blockCardById(cardId: string, requesterWalletId: string): Promise<void> {
  const card = await findCardById(cardId);

  if (!card) {
    throw new Error("CARD_NOT_FOUND");
  }

  if (card.walletId !== requesterWalletId) {
    throw new Error("NOT_OWNER");
  }

  await blockCard(cardId);
}