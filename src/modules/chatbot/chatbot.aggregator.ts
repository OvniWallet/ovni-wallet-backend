// arma un resumen de texto con los movimientos del usuario, usando su
// timezone para calcular "este mes" en su hora local, no en UTC

import { pool } from "../../db/pool";

export async function buildFinancialContext(userId: string, walletId: string): Promise<string> {
  const userResult = await pool.query(`SELECT timezone FROM users WHERE id = $1`, [userId]);
  const timezone = userResult.rows[0]?.timezone || "UTC";

  const balancesResult = await pool.query(
    `SELECT currency, amount_in_cents FROM balances WHERE wallet_id = $1`,
    [walletId]
  );

  const spendResult = await pool.query(
    `SELECT le.currency, SUM(le.amount_in_cents) AS total_cents, COUNT(*) AS cantidad
     FROM ledger_entries le
     JOIN transactions t ON t.id = le.transaction_id
     WHERE le.balance_id IN (SELECT id FROM balances WHERE wallet_id = $1)
       AND le.type = 'DEBIT'
       AND t.type = 'CARD_SPEND'
       AND (t.created_at AT TIME ZONE $2) >= date_trunc('month', now() AT TIME ZONE $2)
     GROUP BY le.currency`,
    [walletId, timezone]
  );

  const balancesText = balancesResult.rows
    .map((r) => `${r.currency}: ${(Number(r.amount_in_cents) / 100).toFixed(2)}`)
    .join(", ");

  const spendText = spendResult.rows.length
    ? spendResult.rows
        .map((r) => `${r.currency}: ${(Number(r.total_cents) / 100).toFixed(2)} en ${r.cantidad} compras`)
        .join(", ")
    : "sin gastos con tarjeta este mes";

  return `Balances actuales: ${balancesText}.\nGastos con tarjeta este mes: ${spendText}.`;
}