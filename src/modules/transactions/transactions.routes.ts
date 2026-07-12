import { Router } from 'express';
import { TransactionsController } from './transactions.controller';
import { isAuth } from '../../middlewares/is-auth.middleware';

const router = Router();
const controller = new TransactionsController();

router.get('/', isAuth, controller.getHistory);
router.post('/deposit', isAuth, controller.deposit);
router.get('/:id', isAuth, controller.getById);

export default router;