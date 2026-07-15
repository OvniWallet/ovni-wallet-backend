export type TransactionEmailType = 'DEPOSIT' | 'P2P_TRANSFER' | 'EXCHANGE' | 'CARD_SPEND';

export interface TransactionEmailExtraRow {
  label: string;
  value: string;
}

export interface TransactionEmailContent {
  transactionId: string;
  type: TransactionEmailType;
  status: string;
  amountInCents: number;
  currency: string;
  occurredAt: Date;
  extraRows?: TransactionEmailExtraRow[];
}

export interface TransactionEmailParams extends TransactionEmailContent {
  toEmail: string;
}
