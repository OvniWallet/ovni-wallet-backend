import { Request, Response, NextFunction } from 'express';

export const idempotency = (req: Request, res: Response, next: NextFunction) => {
  next();
};
