// config de conexion a la db, la usa pool.ts
import 'dotenv/config';

interface DatabaseConfig {
  connectionString: string;
  ssl: { rejectUnauthorized: boolean } | false;
}

function getDatabaseConfig(): DatabaseConfig {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Falta DATABASE_URL en el .env");
  }

  // 💡 DETECCIÓN INTELIGENTE DE SSL:
  // Si la URL contiene "localhost", "127.0.0.1" o el parámetro sslmode=disable, apagamos SSL.
  const deshabilitarSSL = 
    connectionString.includes('localhost') || 
    connectionString.includes('127.0.0.1') || 
    connectionString.includes('sslmode=disable');

  return {
    connectionString,
    ssl: deshabilitarSSL ? false : { rejectUnauthorized: false }, // Supabase lo requiere remoto, local no.
  };
}

export const databaseConfig = getDatabaseConfig();