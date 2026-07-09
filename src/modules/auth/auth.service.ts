//Este archivo Orquesta la lógica de negocio y cifra la contraseña con bcrypt.
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AuthRepository } from './auth.repository';
import { RegisterDTO } from './dto/register.dto';
import { LoginDTO } from './dto/login.dto'; 
import { IRegisterResponse } from './auth.types';
import { RefreshDTO } from './dto/refresh.dto';
import { ENV } from '../../config/env';
import { pool } from '../../db/pool';

export class AuthService {
  private authRepository = new AuthRepository();

  // 🔐 HELPER PRIVADO: Generar Access Token JWT (Expira en 2 horas)
  private generateAccessToken(userId: string, email: string): string {
    return jwt.sign(
      { 
        sub: userId, 
        email 
      }, 
      ENV.JWT_SECRET, 
      { expiresIn: '2h' }
    );
  }

  // ==========================================
  // 1. MÉTODO REGISTER
  // ==========================================
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

  // ==========================================
  // 2. MÉTODO LOGIN (Actualizado con Refresh Token)
  // ==========================================
  async login(dto: LoginDTO): Promise<{ access_token: string; refresh_token: string; user: any }> {
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

    // 3. Generar el par de Tokens (Access JWT + Refresh UUID)
    const accessToken = this.generateAccessToken(user.id, user.email);
    const refreshToken = crypto.randomUUID();

    // 4. Persistir el Refresh Token inicial en la BD de Supabase
    await this.authRepository.saveRefreshToken(user.id, refreshToken);

    // 5. Retornar los tokens y los datos limpios del usuario
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
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

  // ==========================================
  // 3. MÉTODO REFRESH TOKEN (Rotación Cíclica)
  // ==========================================
  async refreshTokenChain(dto: RefreshDTO): Promise<{ access_token: string; refresh_token: string }> {
    // 1. Buscar si el refresh token enviado existe y no ha sido revocado
    const existingToken = await this.authRepository.findRefreshToken(dto.refresh_token);
    if (!existingToken) {
      const error = new Error('Refresh token inválido, inexistente o expirado');
      (error as any).statusCode = 403;
      (error as any).code = 'INVALID_REFRESH_TOKEN';
      throw error;
    }

    // 2. Revocar el token actual inmediatamente para cumplir la regla de un solo uso
    await this.authRepository.revokeRefreshToken(existingToken.id);

    // 3. Buscar el email del usuario usando su user_id para armar el JWT payload
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [existingToken.user_id]);
    const userEmail = rows[0]?.email;

    // 4. Generar la nueva pareja de tokens rodantes
    const newAccessToken = this.generateAccessToken(existingToken.user_id, userEmail);
    const newRefreshToken = crypto.randomUUID();

    // 5. Almacenar el nuevo refresh token enlazándolo a su token "padre"
    await this.authRepository.saveRefreshToken(existingToken.user_id, newRefreshToken);

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    };
  }
}