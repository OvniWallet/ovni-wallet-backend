import { pool } from "../db/pool";

export async function getWalletIdByUserId(userId: string): Promise<string> {
  const result = await pool.query(`SELECT id FROM wallets WHERE user_id = $1`, [userId]);

  if (result.rows.length === 0) {
    throw new Error("WALLET_NOT_FOUND");
  }

  return result.rows[0].id;
}