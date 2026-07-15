import { pool } from '../../db/pool';
import { LedgerService } from '../../ledger/ledger.service';
import { Geolocation, mergeGeoMetadata } from '../../shared/geolocation';

export interface GetTransactionsFilters {
  userId: string;
  limit: number;
  cursor?: string;
  type?: string;
  status?: string;
}

export class TransactionsRepository {
  private ledgerService = new LedgerService();
    //INICIO METODO FINDPAGED
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
  //FIN METODO FINDPAGE

  async findTransactionDetailForUser(userId: string, transactionId: string) {
    const query = `
      SELECT t.id, t.type, t.status, t.metadata, t.created_at,
            le.id AS ledger_entry_id, le.type AS entry_type, le.amount_in_cents, le.currency
      FROM transactions t
      JOIN ledger_entries le ON le.transaction_id = t.id
      JOIN balances b ON b.id = le.balance_id
      JOIN wallets w ON w.id = b.wallet_id
      WHERE t.id = $1 AND w.user_id = $2
      ORDER BY le.id;
    `;
    const { rows } = await pool.query(query, [transactionId, userId]);
    return rows;
  }

  // 🕵️‍♂️ Buscar transacción por llave de idempotencia
  async findByIdempotencyKey(key: string) {
    const query = `
      SELECT id, type, status, metadata FROM transactions WHERE idempotency_key = $1;
    `;
    const { rows } = await pool.query(query, [key]);
    return rows[0] || null;
  }

  // 🚀 Ejecutar el depósito en una transacción atómica de Base de Datos
  async createDeposit(userId: string, amountInCents: number, currency: string, idempotencyKey: string, geo: Geolocation = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Buscar la wallet activa del usuario
      const walletQuery = `SELECT id FROM wallets WHERE user_id = $1 AND status = 'ACTIVE';`;
      const walletResult = await client.query(walletQuery, [userId]);
      
      if (walletResult.rows.length === 0) {
        throw new Error('El usuario no tiene una billetera activa');
      }
      const walletId = walletResult.rows[0].id;

      // 2. Insertar la cabecera en la tabla transactions
      const insertTxQuery = `
        INSERT INTO transactions (idempotency_key, type, status, metadata)
        VALUES ($1, 'DEPOSIT', 'COMPLETED', $2)
        RETURNING id, type, status;
      `;
      const txMetadata = JSON.stringify(
        mergeGeoMetadata(
          { description: 'Depósito simulado inicial', currency, amount_in_cents: amountInCents },
          geo
        )
      );
      const txResult = await client.query(insertTxQuery, [idempotencyKey, txMetadata]);
      const newTransaction = txResult.rows[0];

      // 3. Buscar el id del balance para esa moneda específica en la wallet
      const balanceQuery = `SELECT id FROM balances WHERE wallet_id = $1 AND currency = $2;`;
      const balanceResult = await client.query(balanceQuery, [walletId, currency]);

      if (balanceResult.rows.length === 0) {
        throw new Error(`No se encontró un balance configurado para la divisa ${currency}`);
      }
      const balanceId = balanceResult.rows[0].id;

      // 4. Insertar el asiento contable de CRÉDITO incluyendo la columna currency 👈 ¡CORREGIDO AQUÍ!
      await this.ledgerService.recordEntry(client, newTransaction.id, {
        balanceId,
        type: 'CREDIT',
        amountInCents,
        currency,
      });
      

      await client.query('COMMIT');
      return newTransaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

}