// consultas e inserciones sobre virtual_cards

import { pool } from "../../db/pool";

export interface VirtualCard {
  id: string;
  maskedNumber: string;
  status: string;
  currencyDefault: string;
  createdAt: Date;
}

export async function findCardsByWallet(walletId: string): Promise<VirtualCard[]> {
  const result = await pool.query(
    `SELECT id, masked_number, status, currency_default, created_at
     FROM virtual_cards WHERE wallet_id = $1 ORDER BY created_at DESC`,
    [walletId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    maskedNumber: r.masked_number,
    status: r.status,
    currencyDefault: r.currency_default,
    createdAt: r.created_at,
  }));
}

function generateMaskedNumber(): string {
  const lastFour = Math.floor(1000 + Math.random() * 9000);
  return `•••• ${lastFour}`;
}

export async function createCard(walletId: string, currencyDefault: string): Promise<VirtualCard> {
  const maskedNumber = generateMaskedNumber();

  const result = await pool.query(
    `INSERT INTO virtual_cards (wallet_id, masked_number, status, currency_default)
     VALUES ($1, $2, 'ACTIVE', $3)
     RETURNING id, masked_number, status, currency_default, created_at`,
    [walletId, maskedNumber, currencyDefault]
  );

  const r = result.rows[0];
  return {
    id: r.id,
    maskedNumber: r.masked_number,
    status: r.status,
    currencyDefault: r.currency_default,
    createdAt: r.created_at,
  };
}

export async function findCardById(cardId: string): Promise<VirtualCard & { walletId: string } | null> {
  const result = await pool.query(
    `SELECT id, wallet_id, masked_number, status, currency_default, created_at
     FROM virtual_cards WHERE id = $1`,
    [cardId]
  );

  if (result.rows.length === 0) return null;

  const r = result.rows[0];
  return {
    id: r.id,
    walletId: r.wallet_id,
    maskedNumber: r.masked_number,
    status: r.status,
    currencyDefault: r.currency_default,
    createdAt: r.created_at,
  };
}

export async function blockCard(cardId: string): Promise<void> {
  await pool.query(`UPDATE virtual_cards SET status = 'BLOCKED' WHERE id = $1`, [cardId]);
}