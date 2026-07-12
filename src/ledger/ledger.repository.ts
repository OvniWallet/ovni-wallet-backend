import { PoolClient } from 'pg';
import { LedgerEntryInput, InsertedLedgerEntry } from './ledger.types';

export class LedgerRepository {
  async insertEntry(client: PoolClient, transactionId: string, entry: LedgerEntryInput): Promise<InsertedLedgerEntry> {
    const query = `
      INSERT INTO ledger_entries (transaction_id, balance_id, type, amount_in_cents, currency)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `;
    const { rows } = await client.query(query, [
      transactionId, entry.balanceId, entry.type, entry.amountInCents, entry.currency,
    ]);
    return rows[0];
  }
}