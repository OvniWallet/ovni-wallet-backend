/*
Maneja las consultas crudas SQL usando el pool de Postgres. Aplica una Transacción Atómica 
(BEGIN / COMMIT / ROLLBACK) para garantizar que si falla la creación de un balance o la billetera, no se cree el usuario a medias.
*/
import { pool } from '../../db/pool';
import { IUserEntity } from './auth.types';
import { RegisterDTO } from './dto/register.dto';

export class AuthRepository {
  
    async findByEmail(email: string): Promise<IUserEntity | null> {
        const query = 'SELECT * FROM users WHERE email = $1;';
        const { rows } = await pool.query(query, [email]);
        return rows[0] || null;
    }

  async registerUserWithWallet(dto: RegisterDTO, passwordHash: string): Promise<Omit<IUserEntity, 'password_hash' | 'updated_at'>> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Insertar Usuario con las columnas reales de tu compañero
      const userQuery = `
        INSERT INTO users (email, password_hash, first_name, last_name, country_of_residence, timezone, kyc_status)
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
        RETURNING id, email, first_name, last_name, country_of_residence, timezone, created_at;
      `;
      const userValues = [dto.email, passwordHash, dto.first_name, dto.last_name, dto.country_code, dto.timezone];
      const { rows: userRows } = await client.query(userQuery, userValues);
      const newUser = userRows[0];

      // 2. Insertar Wallet vinculada al usuario (Ajustado sin columna 'type' y con 'ACTIVE')
      const walletQuery = `
        INSERT INTO wallets (user_id, status)
        VALUES ($1, 'ACTIVE')
        RETURNING id;
      `;
      const { rows: walletRows } = await client.query(walletQuery, [newUser.id]);
      const newWalletId = walletRows[0].id;

      // 3. Inicializar Balances para las 6 divisas requeridas en 0 centavos
      const currencies = ['USD', 'EUR', 'GBP', 'ARS', 'BRL', 'JPY'];
      const balanceQuery = `
        INSERT INTO balances (wallet_id, currency, amount_in_cents)
        VALUES ($1, $2, 0);
      `;

      for (const currency of currencies) {
        await client.query(balanceQuery, [newWalletId, currency]);
      }

      await client.query('COMMIT');
      return newUser;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}