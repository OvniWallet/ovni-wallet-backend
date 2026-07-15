// logica de negocio del modulo exchange: cotizar y ejecutar conversiones, con idempotencia

import { getCurrentRate } from "./exchange-rates.repository";
import {
  executeExchange,
  findExistingExchangeTransaction,
  ExistingExchangeTransaction,
} from "./exchange.repository";

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

function matchesExistingPayload(existing: ExistingExchangeTransaction, params: ExecuteParams): boolean {
  return Boolean(
    existing.requestPayload &&
      existing.requestPayload.source_currency === params.sourceCurrency &&
      existing.requestPayload.target_currency === params.targetCurrency &&
      existing.requestPayload.source_amount_cents === params.sourceAmountCents
  );
}

function reuseOrThrowMismatch(existing: ExistingExchangeTransaction, params: ExecuteParams) {
  if (!matchesExistingPayload(existing, params)) {
    throw new Error("IDEMPOTENCY_KEY_MISMATCH");
  }

  return {
    transactionId: existing.id,
    rateApplied: existing.rateApplied ?? undefined,
    targetAmountCents: existing.targetAmountCents ?? undefined,
    reused: true,
  };
}

export async function executeExchangeOperation(params: ExecuteParams) {
  const existing = await findExistingExchangeTransaction(params.idempotencyKey);

  if (existing) {
    return reuseOrThrowMismatch(existing, params);
  }

  const rate = await getCurrentRate(params.sourceCurrency, params.targetCurrency);

  if (!rate) {
    throw new Error("RATE_NOT_FOUND");
  }

  const targetAmountCents = Math.round(params.sourceAmountCents * rate.rateValue);

  try {
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
      reused: false,
    };
  } catch (err: any) {
    if (err.message === "IDEMPOTENCY_KEY_CONFLICT") {
      // otra request con la misma idempotency_key gano la carrera e inserto primero
      const concurrent = await findExistingExchangeTransaction(params.idempotencyKey);
      if (concurrent) {
        return reuseOrThrowMismatch(concurrent, params);
      }
    }
    throw err;
  }
}
