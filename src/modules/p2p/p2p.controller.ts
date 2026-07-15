import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/is-auth.middleware';
import { P2PService } from './p2p.service';
import { transferSchema } from './dto/transfer.dto';
import { notifyTransactionEmail } from '../../integrations/ses/ses.notifications';

export class P2PController {
  private p2pService = new P2PService();

  transfer = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const senderId = req.user?.id;
      const senderEmail = req.user?.email; // Asegúrate de que tu JWT guarde el email

      if (!senderId || !senderEmail) {
        const error = new Error('No autorizado o sesión incompleta');
        (error as any).statusCode = 401;
        throw error;
      }

      // Validar body con Zod
      const parseResult = transferSchema.safeParse(req.body);
      if (!parseResult.success) {
        const error = new Error('Datos de transferencia inválidos');
        (error as any).statusCode = 400;
        (error as any).code = 'INVALID_INPUT';
        (error as any).details = parseResult.error.format();
        throw error;
      }

      const result = await this.p2pService.processTransfer(senderId, senderEmail, parseResult.data);

      if (!(result as any)._idempotent_reused) {
        const occurredAt = new Date();
        await notifyTransactionEmail({
          toEmail: senderEmail,
          transactionId: result.transaction_id,
          type: 'P2P_TRANSFER',
          status: 'COMPLETED',
          amountInCents: result.amount_transferred,
          currency: result.currency,
          occurredAt,
          extraRows: [{ label: 'Destinatario', value: parseResult.data.recipient_email }],
        });

        await notifyTransactionEmail({
          toEmail: parseResult.data.recipient_email,
          transactionId: result.transaction_id,
          type: 'P2P_TRANSFER',
          status: 'COMPLETED',
          amountInCents: result.amount_transferred,
          currency: result.currency,
          occurredAt,
          extraRows: [{ label: 'Remitente', value: senderEmail }],
        });
      }

      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}