import { pool } from "../db/pool";

export interface UserNameInfo {
  first_name: string;
  last_name: string;
}

/**
 * Resuelve nombres de usuarios por id. No expone email ni otros datos
 * sensibles — solo se usa para enriquecer transacciones que el usuario
 * autenticado ya tiene permiso de ver (ej. la contraparte de un P2P).
 */
export async function findUserNamesByIds(userIds: string[]): Promise<Record<string, UserNameInfo>> {
  if (userIds.length === 0) return {};

  const uniqueIds = Array.from(new Set(userIds));
  const result = await pool.query(
    `SELECT id, first_name, last_name FROM users WHERE id = ANY($1::uuid[])`,
    [uniqueIds]
  );

  const byId: Record<string, UserNameInfo> = {};
  for (const row of result.rows) {
    byId[row.id] = { first_name: row.first_name, last_name: row.last_name };
  }

  return byId;
}
