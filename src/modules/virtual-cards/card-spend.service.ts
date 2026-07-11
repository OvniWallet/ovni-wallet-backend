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

export async function simulateSpend(params: SimulateSpendParams) {
  const existing = await findExistingTransaction(params.idempotencyKey);
  if (existing) {
    return { transactionId: existing.id, status: existing.status, reused: true };
  }

  const card = await findCardById(params.cardId);
  if (!card) throw new Error("CARD_NOT_FOUND");
  if (card.walletId !== params.walletId) throw new Error("NOT_OWNER");
  if (card.status === "BLOCKED") throw new Error("CARD_BLOCKED");

  const metadata = { merchant_name: params.merchantName, card_id: params.cardId };


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