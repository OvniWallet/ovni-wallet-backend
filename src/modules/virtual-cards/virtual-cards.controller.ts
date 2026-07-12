import { Request, Response } from "express";
import { listCards, issueCard, blockCardById } from "./virtual-cards.service";
import { getWalletIdByUserId } from "../../shared/wallet-lookup";
import { simulateSpend } from "./card-spend.service";

export async function getCardsController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const walletId = await getWalletIdByUserId(userId);

    const cards = await listCards(walletId);

    res.status(200).json({
      status: "success",
      data: {
        cards: cards.map((c) => ({
          card_id: c.id,
          masked_number: c.maskedNumber,
          status: c.status,
          currency_default: c.currencyDefault,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Error inesperado", details: null },
    });
  }
}

export async function postCardController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id;
    const walletId = await getWalletIdByUserId(userId);
    const { currency_default } = req.body;

    const card = await issueCard(walletId, currency_default);

    res.status(201).json({
      status: "success",
      data: {
        card_id: card.id,
        masked_number: card.maskedNumber,
        status: card.status,
      },
    });
  } catch (err: any) {
    if (err.message === "MAX_CARDS_REACHED") {
      return res.status(422).json({
        status: "error",
        error: { code: "MAX_CARDS_REACHED", message: "Limite de tarjetas alcanzado", details: null },
      });
    }
    res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Error inesperado", details: null },
    });
  }
}

export async function blockCardController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id;
    const walletId = await getWalletIdByUserId(userId);
    const { id } = req.params;

    await blockCardById(id, walletId);

    res.status(200).json({ status: "success", data: { card_id: id, status: "BLOCKED" } });
  } catch (err: any) {
    if (err.message === "CARD_NOT_FOUND") {
      return res.status(404).json({
        status: "error",
        error: { code: "CARD_NOT_FOUND", message: "Tarjeta no encontrada", details: null },
      });
    }
    if (err.message === "NOT_OWNER") {
      return res.status(403).json({
        status: "error",
        error: { code: "NOT_OWNER", message: "No sos el dueño de esta tarjeta", details: null },
      });
    }
    res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Error inesperado", details: null },
    });
  }
}

export async function simulateSpendController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id;
    const walletId = await getWalletIdByUserId(userId);
    const { card_id, amount_in_cents, currency, merchant_name, idempotency_key } = req.body;

    const result = await simulateSpend({
      cardId: card_id,
      walletId,
      userId,
      amountCents: amount_in_cents,
      currency,
      merchantName: merchant_name,
      idempotencyKey: idempotency_key,
    });

    res.status(result.status === "COMPLETED" ? 201 : 200).json({
      status: "success",
      data: { transaction_id: result.transactionId, status: result.status },
    });
  } catch (err: any) {
    if (err.message === "CARD_NOT_FOUND") {
      return res.status(404).json({
        status: "error",
        error: { code: "CARD_NOT_FOUND", message: "Tarjeta no encontrada", details: null },
      });
    }
    if (err.message === "NOT_OWNER") {
      return res.status(403).json({
        status: "error",
        error: { code: "NOT_OWNER", message: "No sos el dueño de esta tarjeta", details: null },
      });
    }
    if (err.message === "CARD_BLOCKED") {
      return res.status(422).json({
        status: "error",
        error: { code: "CARD_BLOCKED", message: "Tarjeta bloqueada", details: null },
      });
    }
    if (err.message === "INSUFFICIENT_FUNDS") {
      return res.status(422).json({
        status: "error",
        error: { code: "INSUFFICIENT_FUNDS", message: "Fondos insuficientes en ninguna divisa", details: null },
      });
    }
    res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Error inesperado", details: null },
    });
  }
}