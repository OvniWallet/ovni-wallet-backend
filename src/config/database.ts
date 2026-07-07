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

  return {
    connectionString,
    ssl: { rejectUnauthorized: false }, // supabase lo requiere
  };
}

export const databaseConfig = getDatabaseConfig();