// ejecuta la conversion dentro de una transaccion SQL:
// bloquea los dos balances, inserta transaction + 2 ledger_entries + detalle de exchange
// respeta idempotencia: si la key ya existe, compara el payload antes de reprocesar

import { PoolClient } from "pg";
import { pool } from "../../db/pool";

interface ExecuteExchangeParams {
  userId: string;
  walletId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountCents: number;
  targetAmountCents: number;
  rateId: string;
  rateApplied: number;
  idempotencyKey: string;
}

export interface ExistingExchangeTransaction {
  id: string;
  status: string;
  requestPayload: Record<string, unknown> | null;
}

export async function findExistingExchangeTransaction(
  idempotencyKey: string
): Promise<ExistingExchangeTransaction | null> {
  const result = await pool.query(
    `SELECT id, status, metadata FROM transactions WHERE idempotency_key = $1`,
    [idempotencyKey]
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    status: row.status,
    requestPayload: row.metadata?.request_payload ?? null,
  };
}

export async function executeExchange(params: ExecuteExchangeParams) {
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    const [first, second] = [params.sourceCurrency, params.targetCurrency].sort();

    const balancesResult = await client.query(
      `SELECT id, currency, amount_in_cents FROM balances
       WHERE wallet_id = $1 AND currency IN ($2, $3)
       ORDER BY currency
       FOR UPDATE`,
      [params.walletId, first, second]
    );

    const sourceBalance = balancesResult.rows.find((r) => r.currency === params.sourceCurrency);
    const targetBalance = balancesResult.rows.find((r) => r.currency === params.targetCurrency);

    if (!sourceBalance || !targetBalance) {
      throw new Error("BALANCE_NOT_FOUND");
    }

    if (Number(sourceBalance.amount_in_cents) < params.sourceAmountCents) {
      throw new Error("INSUFFICIENT_FUNDS");
    }

    const metadata = {
      user_id: params.userId,
      request_payload: {
        source_currency: params.sourceCurrency,
        target_currency: params.targetCurrency,
        source_amount_cents: params.sourceAmountCents,
      },
    };

    const txResult = await client.query(
      `INSERT INTO transactions (idempotency_key, type, status, metadata)
       VALUES ($1, 'EXCHANGE', 'COMPLETED', $2)
       RETURNING id`,
      [params.idempotencyKey, JSON.stringify(metadata)]
    );
    const transactionId = txResult.rows[0].id;

    await client.query(
      `INSERT INTO ledger_entries (transaction_id, balance_id, currency, type, amount_in_cents)
       VALUES ($1, $2, $3, 'DEBIT', $4)`,
      [transactionId, sourceBalance.id, params.sourceCurrency, params.sourceAmountCents]
    );

    await client.query(
      `INSERT INTO ledger_entries (transaction_id, balance_id, currency, type, amount_in_cents)
       VALUES ($1, $2, $3, 'CREDIT', $4)`,
      [transactionId, targetBalance.id, params.targetCurrency, params.targetAmountCents]
    );

    await client.query(
      `INSERT INTO exchange_transaction_details
        (transaction_id, exchange_rate_id, source_currency, target_currency, rate_applied, source_amount_cents, target_amount_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        transactionId,
        params.rateId,
        params.sourceCurrency,
        params.targetCurrency,
        params.rateApplied,
        params.sourceAmountCents,
        params.targetAmountCents,
      ]
    );

    await client.query("COMMIT");

    return { transactionId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
