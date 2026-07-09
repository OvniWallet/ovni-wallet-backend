//Conectamos el validador, el controlador y exponemos la ruta
import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validateRequest } from '../../middlewares/validate-request.middleware';
import { RegisterDTOSchema } from './dto/register.dto';

const router = Router();
const controller = new AuthController();

router.post('/register', validateRequest(RegisterDTOSchema), controller.register);

export default router;