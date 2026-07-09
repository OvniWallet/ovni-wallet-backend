import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validateRequest } from '../../middlewares/validate-request.middleware';
import { RegisterDTOSchema } from './dto/register.dto';
import { LoginDTOSchema } from './dto/login.dto'; 
import { RefreshDTOSchema } from './dto/refresh.dto';

const router = Router();
const controller = new AuthController();

// Ruta de Registro
router.post('/register', validateRequest(RegisterDTOSchema), controller.register);

// Ruta de Login 
router.post('/login', validateRequest(LoginDTOSchema), controller.login);

//Ruta Refresh
router.post('/refresh', validateRequest(RefreshDTOSchema), controller.refresh);

export default router;