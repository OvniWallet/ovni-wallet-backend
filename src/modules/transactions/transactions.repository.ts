import { pool } from '../../db/pool';

export interface GetTransactionsFilters {
  userId: string;
  limit: number;
  cursor?: string;
  type?: string;
  status?: string;
}

export class TransactionsRepository {
  async findPagedTransactions(filters: GetTransactionsFilters) {
    const { userId, limit, cursor, type, status } = filters;
    
    let queryParams: any[] = [userId, limit + 1]; // Traemos un registro extra para saber si hay página siguiente
    let paramIndex = 3;

    let whereClause = `
      WHERE w.user_id = $1
    `;

    if (type) {
      whereClause += ` AND t.type = $${paramIndex}`;
      queryParams.push(type);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND t.status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    if (cursor) {
      // Paginación por cursor basada en la fecha de creación de la transacción cursor
      whereClause += ` AND t.created_at < (SELECT created_at FROM transactions WHERE id = $${paramIndex})`;
      queryParams.push(cursor);
      paramIndex++;
    }

    const query = `
      SELECT DISTINCT t.id, t.type, t.status, t.metadata, t.created_at
      FROM transactions t
      JOIN ledger_entries le ON le.transaction_id = t.id
      JOIN balances b ON b.id = le.balance_id
      JOIN wallets w ON w.id = b.wallet_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $2;
    `;

    const { rows } = await pool.query(query, queryParams);
    return rows;
  }
}