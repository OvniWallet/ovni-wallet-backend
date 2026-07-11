import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/is-auth.middleware';
import { WalletsService } from './wallets.service';

export class WalletsController {
  private walletsService = new WalletsService();

  getBalance = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const error = new Error('No se encontró información del usuario autenticado');
        (error as any).statusCode = 401;
        throw error;
      }

      const result = await this.walletsService.getUserBalance(userId);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}