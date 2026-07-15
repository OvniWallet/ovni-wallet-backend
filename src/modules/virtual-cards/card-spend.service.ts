// logica de simulate-spend: cobra directo si hay saldo, si no convierte lo justo y despues cobra
// idempotencia: si la key existe, compara payload; si difiere, rechaza con IDEMPOTENCY_KEY_MISMATCH

import { findCardById } from "./virtual-cards.repository";
import {
  findExistingTransaction,
  getBalance,
  insertDirectCardSpend,
  insertFailedCardSpend,
} from "./card-spend.repository";
import { getQuote, executeExchangeOperation } from "../exchange/exchange.service";

interface SimulateSpendParams {
  cardId: string;
  walletId: string;
  userId: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  idempotencyKey: string;
}

function buildRequestPayload(params: SimulateSpendParams) {
  return {
    card_id: params.cardId,
    amount_in_cents: params.amountCents,
    currency: params.currency,
  };
}

export async function simulateSpend(params: SimulateSpendParams) {
  const existing = await findExistingTransaction(params.idempotencyKey);
  if (existing) {
    const requested = buildRequestPayload(params);
    const samePayload =
      existing.requestPayload &&
      existing.requestPayload.card_id === requested.card_id &&
      existing.requestPayload.amount_in_cents === requested.amount_in_cents &&
      existing.requestPayload.currency === requested.currency;

    if (!samePayload) {
      throw new Error("IDEMPOTENCY_KEY_MISMATCH");
    }

    return { transactionId: existing.id, status: existing.status, reused: true };
  }

  const card = await findCardById(params.cardId);
  if (!card) throw new Error("CARD_NOT_FOUND");
  if (card.walletId !== params.walletId) throw new Error("NOT_OWNER");
  if (card.status === "BLOCKED") throw new Error("CARD_BLOCKED");

  const metadata = {
    merchant_name: params.merchantName,
    request_payload: buildRequestPayload(params),
  };

  // 1. cobro directo en la divisa de la compra
  const directBalance = await getBalance(params.walletId, params.currency);
  if (directBalance && directBalance.amountCents >= params.amountCents) {
    const transactionId = await insertDirectCardSpend({
      balanceId: directBalance.id,
      currency: params.currency,
      amountCents: params.amountCents,
      idempotencyKey: params.idempotencyKey,
      metadata,
    });
    return { transactionId, status: "COMPLETED", reused: false };
  }

  // 2. si no alcanza, convertimos justo lo necesario desde la divisa default de la tarjeta
  if (card.currencyDefault !== params.currency) {
    const defaultBalance = await getBalance(params.walletId, card.currencyDefault);

    if (defaultBalance) {
      const reverseQuote = await getQuote({
        sourceCurrency: params.currency,
        targetCurrency: card.currencyDefault,
        sourceAmountCents: params.amountCents,
      });
      const neededSourceCents = reverseQuote.targetAmountCents;

      if (defaultBalance.amountCents >= neededSourceCents) {
        const exchangeResult = await executeExchangeOperation({
          userId: params.userId,
          walletId: params.walletId,
          sourceCurrency: card.currencyDefault,
          targetCurrency: params.currency,
          sourceAmountCents: neededSourceCents,
          idempotencyKey: `${params.idempotencyKey}-exchange`,
        });

        const convertedBalance = await getBalance(params.walletId, params.currency);
        if (convertedBalance && convertedBalance.amountCents >= params.amountCents) {
          const transactionId = await insertDirectCardSpend({
            balanceId: convertedBalance.id,
            currency: params.currency,
            amountCents: params.amountCents,
            idempotencyKey: params.idempotencyKey,
            metadata: { ...metadata, triggered_by_exchange_transaction_id: exchangeResult.transactionId },
          });
          return { transactionId, status: "COMPLETED", reused: false };
        }
      }
    }
  }

  // 3. ninguna divisa cubre el monto
  await insertFailedCardSpend(params.idempotencyKey, metadata);
  throw new Error("INSUFFICIENT_FUNDS");
}
