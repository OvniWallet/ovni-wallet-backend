

CREATE OR REPLACE FUNCTION apply_ledger_entry_to_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_current_amount BIGINT;
BEGIN
  SELECT amount_in_cents INTO v_current_amount
  FROM balances
  WHERE id = NEW.balance_id
  FOR UPDATE;

  IF NEW.type = 'CREDIT' THEN
    UPDATE balances
    SET amount_in_cents = amount_in_cents + NEW.amount_in_cents,
        updated_at = now()
    WHERE id = NEW.balance_id;

  ELSIF NEW.type = 'DEBIT' THEN
    IF v_current_amount < NEW.amount_in_cents THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: balance % no cubre %', NEW.balance_id, NEW.amount_in_cents;
    END IF;

    UPDATE balances
    SET amount_in_cents = amount_in_cents - NEW.amount_in_cents,
        updated_at = now()
    WHERE id = NEW.balance_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_ledger_entry
  AFTER INSERT ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION apply_ledger_entry_to_balance();