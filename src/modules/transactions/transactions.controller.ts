import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/is-auth.middleware';
import { TransactionsService } from './transactions.service';

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
}