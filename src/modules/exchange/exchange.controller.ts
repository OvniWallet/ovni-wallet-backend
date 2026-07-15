import { Request, Response } from "express";
import { getQuote, executeExchangeOperation } from "./exchange.service";
import { getWalletIdByUserId } from "../../shared/wallet-lookup";
import { notifyTransactionEmail } from "../../integrations/ses/ses.notifications";

export async function getQuoteController(req: Request, res: Response) {
  try {
    const { source_currency, target_currency, source_amount_cents } = req.query;

    const quote = await getQuote({
      sourceCurrency: String(source_currency),
      targetCurrency: String(target_currency),
      sourceAmountCents: Number(source_amount_cents),
    });

    res.status(200).json({
      status: "success",
      data: {
        rate_value: quote.rateValue.toFixed(10),
        target_amount_cents: quote.targetAmountCents,
        rate_is_stale: quote.rateIsStale,
      },
    });
  } catch (err: any) {
    if (err.message === "RATE_NOT_FOUND") {
      return res.status(502).json({
        status: "error",
        error: { code: "EXTERNAL_SERVICE_UNAVAILABLE", message: "No hay tasa disponible", details: null },
      });
    }
    res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Error inesperado", details: null },
    });
  }
}

export async function postExchangeController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const userEmail = (req as any).user.email;
    const walletId = await getWalletIdByUserId(userId);

    const { source_currency, target_currency, source_amount_cents, idempotency_key } = req.body;

    const result = await executeExchangeOperation({
      userId,
      walletId,
      sourceCurrency: source_currency,
      targetCurrency: target_currency,
      sourceAmountCents: source_amount_cents,
      idempotencyKey: idempotency_key,
    });

    if (!result.reused) {
      await notifyTransactionEmail({
        toEmail: userEmail,
        transactionId: result.transactionId,
        type: 'EXCHANGE',
        status: 'COMPLETED',
        amountInCents: source_amount_cents,
        currency: source_currency,
        occurredAt: new Date(),
        extraRows: [
          {
            label: 'Convertido a',
            value: `${((result.targetAmountCents ?? 0) / 100).toFixed(2)} ${target_currency}`,
          },
          {
            label: 'Tasa aplicada',
            value: result.rateApplied ? result.rateApplied.toFixed(10) : 'N/D',
          },
        ],
      });
    }

    res.status(201).json({
      status: "success",
      data: {
        transaction_id: result.transactionId,
        rate_applied: result.rateApplied?.toFixed(10) ?? null,
        target_amount_cents: result.targetAmountCents ?? null,
      },
    });
  } catch (err: any) {
    if (err.message === "IDEMPOTENCY_KEY_MISMATCH") {
      return res.status(409).json({
        status: "error",
        error: { code: "IDEMPOTENCY_KEY_MISMATCH", message: "La clave ya se uso con otros datos", details: null },
      });
    }
    if (err.message === "INSUFFICIENT_FUNDS") {
      return res.status(422).json({
        status: "error",
        error: { code: "INSUFFICIENT_FUNDS", message: "Fondos insuficientes", details: null },
      });
    }
    if (err.message === "RATE_NOT_FOUND") {
      return res.status(502).json({
        status: "error",
        error: { code: "EXTERNAL_SERVICE_UNAVAILABLE", message: "No hay tasa disponible", details: null },
      });
    }
    res.status(500).json({
      status: "error",
      error: { code: "INTERNAL_ERROR", message: "Error inesperado", details: null },
    });
  }
}
