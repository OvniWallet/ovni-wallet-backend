import { Router } from 'express';
import { P2PController } from './p2p.controller';
import { isAuth } from '../../middlewares/is-auth.middleware';

const router = Router();
const controller = new P2PController();

router.post('/transfers', isAuth, controller.transfer);

export default router;