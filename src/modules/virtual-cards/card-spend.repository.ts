import { PoolClient } from "pg";
import { pool } from "../../db/pool";

interface DirectSpendParams {
  balanceId: string;
  currency: string;
  amountCents: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

export async function findExistingTransaction(idempotencyKey: string) {
  const result = await pool.query(
    `SELECT id, status FROM transactions WHERE idempotency_key = $1`,
    [idempotencyKey]
  );
  return result.rows[0] ?? null;
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
  } catch (err) {
    await client.query("ROLLBACK");
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