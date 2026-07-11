import { getCurrentRate } from "./exchange-rates.repository";
import { executeExchange } from "./exchange.repository";

interface QuoteParams {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountCents: number;
}

export async function getQuote(params: QuoteParams) {
  const rate = await getCurrentRate(params.sourceCurrency, params.targetCurrency);

  if (!rate) {
    throw new Error("RATE_NOT_FOUND");
  }

  const targetAmountCents = Math.round(params.sourceAmountCents * rate.rateValue);

  return {
    rateValue: rate.rateValue,
    targetAmountCents,
    rateIsStale: false, // por ahora fijo, lo ajustamos cuando armemos el fallback
  };
}

interface ExecuteParams {
  userId: string;
  walletId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountCents: number;
  idempotencyKey: string;
}

export async function executeExchangeOperation(params: ExecuteParams) {
  const rate = await getCurrentRate(params.sourceCurrency, params.targetCurrency);

  if (!rate) {
    throw new Error("RATE_NOT_FOUND");
  }

  const targetAmountCents = Math.round(params.sourceAmountCents * rate.rateValue);

  const result = await executeExchange({
    userId: params.userId,
    walletId: params.walletId,
    sourceCurrency: params.sourceCurrency,
    targetCurrency: params.targetCurrency,
    sourceAmountCents: params.sourceAmountCents,
    targetAmountCents,
    rateId: rate.id,
    rateApplied: rate.rateValue,
    idempotencyKey: params.idempotencyKey,
  });

  return {
    transactionId: result.transactionId,
    rateApplied: rate.rateValue,
    targetAmountCents,
  };
}