import { pool } from '../../db/pool';
import { LedgerService } from '../../ledger/ledger.service';

export class P2PRepository {
  private ledgerService = new LedgerService();
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
  // Reintenta ante 40001 (conflicto de serialización), esperado con SERIALIZABLE
  async executeP2PTransfer(senderId: string, recipientId: string, amountInCents: number, currency: string, idempotencyKey: string) {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.runTransferAttempt(senderId, recipientId, amountInCents, currency, idempotencyKey);
      } catch (error: any) {
        if (error?.code === '40001' && attempt < MAX_RETRIES) {
          continue; // conflicto de serialización, reintentar
        }
        throw error;
      }
    }
    throw new Error('P2P_TRANSFER_RETRY_EXHAUSTED');
  }

  private async runTransferAttempt(senderId: string, recipientId: string, amountInCents: number, currency: string, idempotencyKey: string) {
    const client = await pool.connect();
    try {
      // Nivel exigido por el documento para P2P
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');

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
      // amount_in_cents guardado para poder validar idempotencia después
      const txMetadata = JSON.stringify({ description: 'Transferencia P2P', currency, amount_in_cents: amountInCents, senderId, recipientId });
      const txResult = await client.query(insertTxQuery, [idempotencyKey, txMetadata]);
      const transactionId = txResult.rows[0].id;

      // 5. Registrar ambas líneas contables vía el módulo Ledger (valida partida doble)
      await this.ledgerService.recordEntries(client, transactionId, [
        { balanceId: senderBalance.id, type: 'DEBIT', amountInCents, currency },
        { balanceId: recipientBalance.id, type: 'CREDIT', amountInCents, currency },
      ]);

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