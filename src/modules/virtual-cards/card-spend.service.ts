// logica de simulate-spend: cobra directo si hay saldo, si no convierte lo justo y despues cobra
// idempotencia: si la key existe, compara payload; si difiere, rechaza con IDEMPOTENCY_KEY_MISMATCH

import { findCardById } from "./virtual-cards.repository";
import {
  findExistingTransaction,
  getBalance,
  insertDirectCardSpend,
  insertFailedCardSpend,
  ExistingSpendTransaction,
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

function matchesExistingPayload(existing: ExistingSpendTransaction, params: SimulateSpendParams): boolean {
  const requested = buildRequestPayload(params);
  return Boolean(
    existing.requestPayload &&
      existing.requestPayload.card_id === requested.card_id &&
      existing.requestPayload.amount_in_cents === requested.amount_in_cents &&
      existing.requestPayload.currency === requested.currency
  );
}

function reuseOrThrowMismatch(existing: ExistingSpendTransaction, params: SimulateSpendParams) {
  if (!matchesExistingPayload(existing, params)) {
    throw new Error("IDEMPOTENCY_KEY_MISMATCH");
  }
  return { transactionId: existing.id, status: existing.status, reused: true };
}

// wrapper idempotente: si otra request concurrente ya inserto con esta
// idempotency_key (23505 traducido a IDEMPOTENCY_KEY_CONFLICT en el repository),
// relee la transaccion ganadora en vez de devolver un 500
async function insertDirectCardSpendIdempotent(
  params: SimulateSpendParams,
  insertParams: { balanceId: string; currency: string; amountCents: number; metadata: Record<string, unknown> }
) {
  try {
    const transactionId = await insertDirectCardSpend({
      balanceId: insertParams.balanceId,
      currency: insertParams.currency,
      amountCents: insertParams.amountCents,
      idempotencyKey: params.idempotencyKey,
      metadata: insertParams.metadata,
    });
    return { transactionId, status: "COMPLETED", reused: false };
  } catch (err: any) {
    if (err.message === "IDEMPOTENCY_KEY_CONFLICT") {
      const concurrent = await findExistingTransaction(params.idempotencyKey);
      if (concurrent) {
        return reuseOrThrowMismatch(concurrent, params);
      }
    }
    throw err;
  }
}

export async function simulateSpend(params: SimulateSpendParams) {
  const existing = await findExistingTransaction(params.idempotencyKey);
  if (existing) {
    return reuseOrThrowMismatch(existing, params);
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
    return insertDirectCardSpendIdempotent(params, {
      balanceId: directBalance.id,
      currency: params.currency,
      amountCents: params.amountCents,
      metadata,
    });
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
          return insertDirectCardSpendIdempotent(params, {
            balanceId: convertedBalance.id,
            currency: params.currency,
            amountCents: params.amountCents,
            metadata: { ...metadata, triggered_by_exchange_transaction_id: exchangeResult.transactionId },
          });
        }
      }
    }
  }

  // 3. ninguna divisa cubre el monto
  await insertFailedCardSpend(params.idempotencyKey, metadata);
  throw new Error("INSUFFICIENT_FUNDS");
}
