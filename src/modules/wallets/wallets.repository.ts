import { pool } from '../../db/pool';

export interface CurrencyBalance {
  currency: string;
  amount_in_cents: string; // Postgres bigint retorna como string en pg-node
}

export class WalletsRepository {
  async findBalancesByUserId(userId: string): Promise<CurrencyBalance[]> {
    const query = `
      SELECT b.currency, b.amount_in_cents
      FROM wallets w
      JOIN balances b ON b.wallet_id = w.id
      WHERE w.user_id = $1 AND w.status = 'ACTIVE';
    `;
    const { rows } = await pool.query(query, [userId]);
    return rows;
  }
}