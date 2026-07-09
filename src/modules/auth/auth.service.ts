//Este archivo Orquesta la lógica de negocio y cifra la contraseña con bcrypt.
import bcrypt from 'bcrypt';
import { AuthRepository } from './auth.repository';
import { RegisterDTO } from './dto/register.dto';
import { IRegisterResponse } from './auth.types';

export class AuthService {
  private authRepository = new AuthRepository();

  async register(dto: RegisterDTO): Promise<IRegisterResponse> {
    // Verificar si el usuario ya existe
    const existingUser = await this.authRepository.findByEmail(dto.email);
    if (existingUser) {
      const error = new Error('El correo electrónico ya está registrado');
      (error as any).statusCode = 422;
      (error as any).code = 'EMAIL_ALREADY_REGISTERED';
      throw error;
    }

    // Hashear contraseña (Salt rounds = 12 por estándar de seguridad)
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // Guardar relacionalmente usando la transacción
    const user = await this.authRepository.registerUserWithWallet(dto, passwordHash);

    return { user };
  }
}