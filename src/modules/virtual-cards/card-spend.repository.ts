// inserta un CARD_SPEND directo (debito simple) cuando ya hay saldo en la divisa de cobro

import { PoolClient } from "pg";
import { pool } from "../../db/pool";

interface DirectSpendParams {
  balanceId: string;
  currency: string;
  amountCents: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

export interface ExistingSpendTransaction {
  id: string;
  status: string;
  requestPayload: Record<string, unknown> | null;
}

export async function findExistingTransaction(idempotencyKey: string): Promise<ExistingSpendTransaction | null> {
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

export async function getBalance(walletId: string, currency: string) {
  const result = await pool.query(
    `SELECT id, amount_in_cents FROM balances WHERE wallet_id = $1 AND currency = $2`,
    [walletId, currency]
  );
  return result.rows[0]
    ? { id: result.rows[0].id, amountCents: Number(result.rows[0].amount_in_cents) }
    : null;
}

export async function insertDirectCardSpend(params: DirectSpendParams): Promise<string> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const txResult = await client.query(
      `INSERT INTO transactions (idempotency_key, type, status, metadata)
       VALUES ($1, 'CARD_SPEND', 'COMPLETED', $2)
       RETURNING id`,
      [params.idempotencyKey, JSON.stringify(params.metadata)]
    );
    const transactionId = txResult.rows[0].id;

    await client.query(
      `INSERT INTO ledger_entries (transaction_id, balance_id, currency, type, amount_in_cents)
       VALUES ($1, $2, $3, 'DEBIT', $4)`,
      [transactionId, params.balanceId, params.currency, params.amountCents]
    );

    await client.query("COMMIT");
    return transactionId;
  } catch (err: any) {
    await client.query("ROLLBACK");
    // otra request concurrente ya inserto una transaction con esta idempotency_key
    if (err?.code === "23505") {
      throw new Error("IDEMPOTENCY_KEY_CONFLICT");
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function insertFailedCardSpend(idempotencyKey: string, metadata: Record<string, unknown>) {
  await pool.query(
    `INSERT INTO transactions (idempotency_key, type, status, metadata)
     VALUES ($1, 'CARD_SPEND', 'FAILED', $2)`,
    [idempotencyKey, JSON.stringify(metadata)]
  );
}
