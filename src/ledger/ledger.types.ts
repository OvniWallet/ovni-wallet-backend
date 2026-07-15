export type LedgerEntryType = 'DEBIT' | 'CREDIT';

export interface LedgerEntryInput {
  balanceId: string;
  type: LedgerEntryType;
  amountInCents: number;
  currency: string;
}

export interface InsertedLedgerEntry {
  id: string;
}