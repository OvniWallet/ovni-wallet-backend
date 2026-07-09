import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validateRequest } from '../../middlewares/validate-request.middleware';
import { RegisterDTOSchema } from './dto/register.dto';
import { LoginDTOSchema } from './dto/login.dto'; // 👈 Asegúrate de que esta línea exista

const router = Router();
const controller = new AuthController();

// Ruta de Registro
router.post('/register', validateRequest(RegisterDTOSchema), controller.register);

// Ruta de Login (Fíjate bien que aquí adentro diga LoginDTOSchema)
router.post('/login', validateRequest(LoginDTOSchema), controller.login);

export default router;