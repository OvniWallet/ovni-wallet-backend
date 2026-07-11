import { pool } from '../../db/pool';

export class P2PRepository {
  // 🛡️ Buscar por llave de idempotencia para evitar duplicados
  async findByIdempotencyKey(key: string) {
    const query = `
      SELECT id, type, status, metadata FROM transactions WHERE idempotency_key = $1;
    `;
    const { rows } = await pool.query(query, [key]);
    return rows[0] || null;
  }

  // 🔍 Buscar el ID de usuario por email
  async findUserByEmail(email: string) {
    const query = `SELECT id FROM users WHERE email = $1;`;
    const { rows } = await pool.query(query, [email]);
    return rows[0] || null;
  }

  // 🚀 TRANSFERENCIA ATÓMICA CON SELECT FOR UPDATE ORDENADO
  async executeP2PTransfer(senderId: string, recipientId: string, amountInCents: number, currency: string, idempotencyKey: string) {
    const client = await pool.connect();
    try {
      // Usamos REPEATABLE READ para asegurar consistencia durante los bloqueos
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');

      // 1. Obtener balance_id del emisor
      const senderBalQuery = `
        SELECT b.id, b.amount_in_cents 
        FROM balances b
        JOIN wallets w ON w.id = b.wallet_id
        WHERE w.user_id = $1 AND b.currency = $2 AND w.status = 'ACTIVE';
      `;
      const senderBalResult = await client.query(senderBalQuery, [senderId, currency]);
      if (senderBalResult.rows.length === 0) {
        throw new Error('BALANCE_NOT_FOUND_SENDER');
      }
      const senderBalance = senderBalResult.rows[0];

      // 2. Obtener balance_id del receptor
      const recipientBalQuery = `
        SELECT b.id 
        FROM balances b
        JOIN wallets w ON w.id = b.wallet_id
        WHERE w.user_id = $1 AND b.currency = $2 AND w.status = 'ACTIVE';
      `;
      const recipientBalResult = await client.query(recipientBalQuery, [recipientId, currency]);
      if (recipientBalResult.rows.length === 0) {
        throw new Error('BALANCE_NOT_FOUND_RECIPIENT');
      }
      const recipientBalance = recipientBalResult.rows[0];

      // 🚨 PREVENCIÓN DE DEADLOCKS: Ordenar los IDs alfabéticamente para el FOR UPDATE
      const idsToLock = [senderBalance.id, recipientBalance.id].sort();
      
      await client.query(
        `SELECT id FROM balances WHERE id IN ($1, $2) FOR UPDATE;`,
        [idsToLock[0], idsToLock[1]]
      );

      // 3. Volver a verificar el saldo actual del emisor ya con la fila bloqueada
      const verifyQuery = `SELECT amount_in_cents FROM balances WHERE id = $1;`;
      const verifyResult = await client.query(verifyQuery, [senderBalance.id]);
      if (verifyResult.rows[0].amount_in_cents < amountInCents) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // 4. Registrar la cabecera de la transacción (P2P_TRANSFER)
      const insertTxQuery = `
        INSERT INTO transactions (idempotency_key, type, status, metadata)
        VALUES ($1, 'P2P_TRANSFER', 'COMPLETED', $2)
        RETURNING id;
      `;
      const txMetadata = JSON.stringify({ description: 'Transferencia P2P', currency, senderId, recipientId });
      const txResult = await client.query(insertTxQuery, [idempotencyKey, txMetadata]);
      const transactionId = txResult.rows[0].id;

      // 5. Insertar Asiento Contable: DEBIT (Resta al emisor)
      const insertDebitQuery = `
        INSERT INTO ledger_entries (transaction_id, balance_id, type, amount_in_cents, currency)
        VALUES ($1, $2, 'DEBIT', $3, $4);
      `;
      await client.query(insertDebitQuery, [transactionId, senderBalance.id, amountInCents, currency]);

      // 6. Insertar Asiento Contable: CREDIT (Suma al receptor)
      const insertCreditQuery = `
        INSERT INTO ledger_entries (transaction_id, balance_id, type, amount_in_cents, currency)
        VALUES ($1, $2, 'CREDIT', $3, $4);
      `;
      await client.query(insertCreditQuery, [transactionId, recipientBalance.id, amountInCents, currency]);

      await client.query('COMMIT');
      return { transactionId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}