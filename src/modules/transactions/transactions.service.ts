import { TransactionsRepository } from './transactions.repository';

export class TransactionsService {
  private transactionsRepository = new TransactionsRepository();

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
}