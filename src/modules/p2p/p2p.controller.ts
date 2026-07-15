import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/is-auth.middleware';
import { P2PService } from './p2p.service';
import { transferSchema } from './dto/transfer.dto';

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

      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}