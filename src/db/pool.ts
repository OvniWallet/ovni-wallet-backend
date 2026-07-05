import { Pool } from "pg";
import { databaseConfig } from "../config/database";

export const pool = new Pool({
  connectionString: databaseConfig.connectionString,
  ssl: databaseConfig.ssl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("Error en el pool de postgres:", err);
});

export async function testDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("Conexion a la DB ok");
  } finally {
    client.release();
  }
}