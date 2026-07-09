import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
//import { pool } from '../../db/pool';

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
      const result = await this.authService.login(req.body);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };
  //FIN METODO LOGIN
  //INICIO METODO REFRESH
  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.refreshTokenChain(req.body);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  };
  //FIN METODO REFRESH
  //INICIO METODO LOGOUT
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await this.authService.logout(req.body);
        res.status(200).json({
        status: 'success',
        data: result,
        });
    } catch (error) {
        next(error);
    }
    };
  //FIN METODO LOGOUT
}