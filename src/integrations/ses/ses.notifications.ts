import { sendEmail } from './ses.client';
import { buildTransactionEmailHtml } from './ses.templates';
import { TransactionEmailParams, TransactionEmailType } from './ses.types';
import { logger } from '../../config/logger';

const SUBJECT_BY_TYPE: Record<TransactionEmailType, string> = {
  DEPOSIT: 'Confirmación de tu depósito - OvniWallet',
  P2P_TRANSFER: 'Movimiento de transferencia - OvniWallet',
  EXCHANGE: 'Cambio de divisa realizado - OvniWallet',
  CARD_SPEND: 'Compra con tarjeta registrada - OvniWallet',
};

export async function notifyTransactionEmail(params: TransactionEmailParams): Promise<void> {
  try {
    const subject = SUBJECT_BY_TYPE[params.type];
    const html = buildTransactionEmailHtml(params);
    await sendEmail(params.toEmail, subject, html);
  } catch (error: any) {
    logger.warn('No se pudo enviar el correo de notificación de transacción', {
      transactionId: params.transactionId,
      type: params.type,
      toEmail: params.toEmail,
      error: error?.message,
    });
  }
}
