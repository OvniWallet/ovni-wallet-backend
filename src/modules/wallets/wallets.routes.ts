import { Router } from 'express';
import { WalletsController } from './wallets.controller';
import { isAuth } from '../../middlewares/is-auth.middleware';

const router = Router();
const controller = new WalletsController();

// Protegemos la ruta pasándole primero el middleware isAuth
router.get('/balance', isAuth, controller.getBalance);

export default router;