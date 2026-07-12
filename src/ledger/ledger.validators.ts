import { LedgerEntryInput } from './ledger.types';

export function assertBalancedEntries(entries: LedgerEntryInput[]): void {
  const totalDebit = entries.filter(e => e.type === 'DEBIT').reduce((sum, e) => sum + e.amountInCents, 0);
  const totalCredit = entries.filter(e => e.type === 'CREDIT').reduce((sum, e) => sum + e.amountInCents, 0);

  if (entries.length === 0 || totalDebit !== totalCredit) {
    const error = new Error('Las líneas contables no están balanceadas (débitos != créditos)');
    (error as any).code = 'LEDGER_ENTRIES_NOT_BALANCED';
    throw error;
  }
}