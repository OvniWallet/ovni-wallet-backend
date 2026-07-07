-- Ovni Wallet - esquema inicial


CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE kyc_status_enum AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE wallet_status_enum AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE currency_enum AS ENUM ('USD', 'EUR', 'GBP', 'ARS', 'BRL', 'JPY');
CREATE TYPE card_status_enum AS ENUM ('ACTIVE', 'BLOCKED');
CREATE TYPE transaction_type_enum AS ENUM ('DEPOSIT', 'P2P_TRANSFER', 'EXCHANGE', 'CARD_SPEND');
CREATE TYPE transaction_status_enum AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE ledger_entry_type_enum AS ENUM ('DEBIT', 'CREDIT');

-- Usuarios
CREATE TABLE users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                VARCHAR(255) NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100) NOT NULL,
  kyc_status           kyc_status_enum NOT NULL DEFAULT 'PENDING',
  country_of_residence VARCHAR(3) NOT NULL,
  timezone             VARCHAR(64) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  status     wallet_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  currency        currency_enum NOT NULL,
  amount_in_cents BIGINT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, currency),
  CONSTRAINT balances_amount_non_negative CHECK (amount_in_cents >= 0)
);

CREATE TABLE virtual_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id        UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  masked_number    VARCHAR(32) NOT NULL,
  status           card_status_enum NOT NULL DEFAULT 'ACTIVE',
  currency_default currency_enum NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key             VARCHAR(255) NOT NULL UNIQUE,
  type                        transaction_type_enum NOT NULL,
  status                      transaction_status_enum NOT NULL DEFAULT 'PENDING',
  reversed_by_transaction_id  UUID NULL REFERENCES transactions(id),
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  balance_id      UUID NOT NULL REFERENCES balances(id) ON DELETE RESTRICT,
  currency        currency_enum NOT NULL,
  type            ledger_entry_type_enum NOT NULL,
  amount_in_cents BIGINT NOT NULL CHECK (amount_in_cents > 0)
);

CREATE TABLE exchange_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency   currency_enum NOT NULL,
  target_currency currency_enum NOT NULL,
  rate_value      NUMERIC(20, 10) NOT NULL,
  is_current      BOOLEAN NOT NULL DEFAULT true,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE UNIQUE INDEX one_current_rate_per_pair
  ON exchange_rates (base_currency, target_currency)
  WHERE is_current = true;


CREATE TABLE exchange_transaction_details (
  transaction_id       UUID PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  exchange_rate_id     UUID NOT NULL REFERENCES exchange_rates(id),
  source_currency      currency_enum NOT NULL,
  target_currency      currency_enum NOT NULL,
  rate_applied         NUMERIC(20, 10) NOT NULL,
  source_amount_cents  BIGINT NOT NULL,
  target_amount_cents  BIGINT NOT NULL
);

CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) NOT NULL UNIQUE,
  revoked      BOOLEAN NOT NULL DEFAULT false,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

--indices para consultas frecuentes
CREATE INDEX idx_balances_wallet_id ON balances(wallet_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_entries_balance_id ON ledger_entries(balance_id);
CREATE INDEX idx_virtual_cards_wallet_id ON virtual_cards(wallet_id);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);