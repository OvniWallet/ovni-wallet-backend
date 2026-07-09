//Este archivo Orquesta la lógica de negocio y cifra la contraseña con bcrypt.
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';
import { RegisterDTO } from './dto/register.dto';
import { LoginDTO } from './dto/login.dto'; 
import { IRegisterResponse } from './auth.types';
import { ENV } from '../../config/env';

export class AuthService {
  private authRepository = new AuthRepository();

  //INICIO METODO REGISTER
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
  //fIN METODO REGISTER
  //INICIO METODO LOGIN
  async login(dto: LoginDTO): Promise<{ token: string; user: any }> {
    // 1. Buscar al usuario por email
    const user = await this.authRepository.findByEmail(dto.email);
    if (!user) {
      const error = new Error('Credenciales inválidas');
      (error as any).statusCode = 401;
      (error as any).code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // 2. Comparar la contraseña enviada con el hash de la base de datos
    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!isPasswordValid) {
      const error = new Error('Credenciales inválidas');
      (error as any).statusCode = 401;
      (error as any).code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // 3. Generar el Token JWT (Expira en 2 horas por seguridad)
    const token = jwt.sign(
      { 
        sub: user.id, 
        email: user.email 
      },
      ENV.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 4. Retornar el token y los datos limpios del usuario
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        country_of_residence: user.country_of_residence,
        timezone: user.timezone,
      },
    };
  }
  //FIN METODO LOGIN
}