import { PoolClient } from 'pg';
import { LedgerRepository } from './ledger.repository';
import { LedgerEntryInput, InsertedLedgerEntry } from './ledger.types';
import { assertBalancedEntries } from './ledger.validators';

export class LedgerService {
  private ledgerRepository = new LedgerRepository();

  // Una sola línea, sin contrapartida modelada (ej. depósitos simulados)
  async recordEntry(client: PoolClient, transactionId: string, entry: LedgerEntryInput): Promise<InsertedLedgerEntry> {
    return this.ledgerRepository.insertEntry(client, transactionId, entry);
  }

  // Partida doble validada (ej. P2P, exchange, tarjetas)
  async recordEntries(client: PoolClient, transactionId: string, entries: LedgerEntryInput[]): Promise<InsertedLedgerEntry[]> {
    assertBalancedEntries(entries);
    const inserted: InsertedLedgerEntry[] = [];
    for (const entry of entries) {
      inserted.push(await this.ledgerRepository.insertEntry(client, transactionId, entry));
    }
    return inserted;
  }
}