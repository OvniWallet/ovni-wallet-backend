import { TransactionEmailContent, TransactionEmailType } from './ses.types';

const TYPE_LABELS: Record<TransactionEmailType, string> = {
  DEPOSIT: 'Depósito',
  P2P_TRANSFER: 'Transferencia entre usuarios',
  EXCHANGE: 'Cambio de divisa',
  CARD_SPEND: 'Compra con tarjeta virtual',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAmount(amountInCents: number, currency: string): string {
  return `${(amountInCents / 100).toFixed(2)} ${currency}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

function buildExtraRowsHtml(extraRows: TransactionEmailContent['extraRows']): string {
  if (!extraRows || extraRows.length === 0) {
    return '';
  }
  return extraRows
    .map(
      (row) => `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">${escapeHtml(row.label)}</td>
          <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${escapeHtml(row.value)}</td>
        </tr>`
    )
    .join('');
}

export function buildTransactionEmailHtml(params: TransactionEmailContent): string {
  const extraRowsHtml = buildExtraRowsHtml(params.extraRows);
  const safeCurrency = escapeHtml(params.currency);

  return `
<!DOCTYPE html>
<html lang="es">
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius: 12px; overflow: hidden; max-width: 480px; width: 100%;">
            <tr>
              <td style="background-color:#4338ca; padding: 24px; text-align:center;">
                <span style="color:#ffffff; font-size: 20px; font-weight: 700;">OvniWallet</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px;">
                <p style="margin:0 0 16px 0; color:#111827; font-size:16px;">
                  Confirmamos el siguiente movimiento en tu cuenta:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Tipo de operación</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${TYPE_LABELS[params.type]}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Monto</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${formatAmount(params.amountInCents, safeCurrency)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Moneda</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${safeCurrency}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Fecha</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">${formatDate(params.occurredAt)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Estado</td>
                    <td style="padding: 8px 0; color: #059669; font-size: 14px; text-align: right; font-weight: 600;">${escapeHtml(params.status)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">ID de transacción</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 12px; text-align: right; font-family: monospace;">${escapeHtml(params.transactionId)}</td>
                  </tr>
                  ${extraRowsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f9fafb; padding: 16px 24px; text-align:center;">
                <span style="color:#9ca3af; font-size: 12px;">Este es un correo automático, no respondas a esta dirección.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}
