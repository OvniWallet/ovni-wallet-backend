// consultas sobre exchange rates

import { pool } from "../../db/pool";

export interface CurrentRate {
  id: string;
  rateValue: number;
}

export async function getCurrentRate(
  baseCurrency: string,
  targetCurrency: string
): Promise<CurrentRate | null> {
  const result = await pool.query(
    `SELECT id, rate_value FROM exchange_rates
     WHERE base_currency = $1 AND target_currency = $2 AND is_current = true
     LIMIT 1`,
    [baseCurrency, targetCurrency]
  );

  if (result.rows.length === 0) return null;

  return {
    id: result.rows[0].id,
    rateValue: Number(result.rows[0].rate_value),
  };
}