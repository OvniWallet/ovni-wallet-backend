import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export const isAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const error = new Error('No autorizado, token ausente');
      (error as any).statusCode = 401;
      (error as any).code = 'UNAUTHORIZED_MISSING_TOKEN';
      throw error;
    }

    const token = authHeader.split(' ')[1];

    // Verificar y decodificar el JWT
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as { sub: string; email: string };

    // Inyectar los datos del usuario en el objeto Request de Express
    req.user = {
      id: decoded.sub,
      email: decoded.email,
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      const expiredError = new Error('El token de acceso ha expirado');
      (expiredError as any).statusCode = 401;
      (expiredError as any).code = 'ACCESS_TOKEN_EXPIRED';
      return next(expiredError);
    }
    
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED_INVALID_TOKEN';
    next(error);
  }
};