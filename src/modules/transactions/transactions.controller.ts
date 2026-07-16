import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/is-auth.middleware';
import { TransactionsService } from './transactions.service';
import { depositSchema } from './dto/deposit.dto';
import { notifyTransactionEmail } from '../../integrations/ses/ses.notifications';

export class TransactionsController {
  private transactionsService = new TransactionsService();

  getHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const error = new Error('No autorizado');
        (error as any).statusCode = 401;
        throw error;
      }

      const result = await this.transactionsService.getHistory(userId, req.query);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };


  deposit = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email;

      if (!userId || !userEmail) {
        const error = new Error('No autorizado');
        (error as any).statusCode = 401;
        throw error;
      }

      // Validar sintácticamente el body con Zod
      const parseResult = depositSchema.safeParse(req.body);
      if (!parseResult.success) {
        const error = new Error('Datos de entrada inválidos');
        (error as any).statusCode = 400;
        (error as any).code = 'INVALID_INPUT';
        (error as any).details = parseResult.error.format();
        throw error;
      }

      const result = await this.transactionsService.processDeposit(userId, parseResult.data);

      if (!(result as any)._idempotent_reused) {
        await notifyTransactionEmail({
          toEmail: userEmail,
          transactionId: result.transaction_id,
          type: 'DEPOSIT',
          status: result.status,
          amountInCents: parseResult.data.amount_in_cents,
          currency: parseResult.data.currency,
          occurredAt: new Date(),
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

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const error = new Error('No autorizado');
        (error as any).statusCode = 401;
        throw error;
      }

      const { id } = req.params;
      const result = await this.transactionsService.getTransactionDetail(userId, id);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}