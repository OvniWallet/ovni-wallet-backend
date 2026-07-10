import { TransactionsRepository } from './transactions.repository';
import { DepositDTO } from './dto/deposit.dto';

export class TransactionsService {
  private transactionsRepository = new TransactionsRepository();
    //INICIO METODO GETHISTORY
  async getHistory(userId: string, query: any) {
    const limit = Math.min(Number(query.limit) || 20, 50); // Máximo 50 por contrato
    const cursor = query.cursor ? String(query.cursor) : undefined;
    const type = query.type ? String(query.type) : undefined;
    const status = query.status ? String(query.status) : undefined;

    const rows = await this.transactionsRepository.findPagedTransactions({
      userId,
      limit,
      cursor,
      type,
      status,
    });

    // Validar si hay una página siguiente
    const hasNextPage = rows.length > limit;
    const transactions = hasNextPage ? rows.slice(0, limit) : rows;
    
    // El next_cursor será el ID de la última transacción de esta página
    const nextCursor = hasNextPage && transactions.length > 0 
      ? transactions[transactions.length - 1].id 
      : null;

    return {
      transactions: transactions.map(t => ({
        transaction_id: t.id,
        type: t.type,
        status: t.status,
        metadata: t.metadata,
        created_at: t.created_at
      })),
      next_cursor: nextCursor,
    };
  }
  //FIN METODO GETHISTORY
  //INICIO METODO PROCESSDEPOSIT
  async processDeposit(userId: string, data: DepositDTO) {
    const { amount_in_cents, currency, idempotency_key } = data;

    // 🛡️ REGLA DE IDEMPOTENCIA (Fase 6/v2): Evitar procesar dos veces el mismo request
    const existingTx = await this.transactionsRepository.findByIdempotencyKey(idempotency_key);
    if (existingTx) {
      return {
        transaction_id: existingTx.id,
        type: existingTx.type,
        status: existingTx.status,
        _idempotent_reused: true // Flag informativo para nosotros
      };
    }

    // Si no existe, procedemos a realizar el depósito de forma normal
    const transaction = await this.transactionsRepository.createDeposit(
      userId,
      amount_in_cents,
      currency,
      idempotency_key
    );

    return {
      transaction_id: transaction.id,
      type: transaction.type,
      status: transaction.status,
    };
  }
  //FIN METODO PROCESSDEPOSIT
}