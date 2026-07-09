import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';

export class AuthController {
  private authService = new AuthService();
  //INICIO METODO REGISTER  
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.register(req.body);
      
      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
  //FIN METODO REGISTER
  //INICIO METODO LOGIN
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // El body ya viene validado por el middleware de Zod
      const result = await this.authService.login(req.body);
      
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
  //FIN METODO LOGIN
}