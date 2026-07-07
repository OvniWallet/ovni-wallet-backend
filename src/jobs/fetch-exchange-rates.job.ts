// trae las tasas desde la Exchange Rate API y las guarda en exchange_rates
// el trigger de la DB se encarga de desactivar la tasa vieja del mismo par

import { pool } from "../db/pool";
import { fetchRatesFromExternalApi } from "../integrations/exchange-rate-api/exchange-rate.client";

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "ARS", "BRL", "JPY"];

export async function fetchAndStoreExchangeRates(): Promise<void> {
  for (const baseCurrency of SUPPORTED_CURRENCIES) {
    const rates = await fetchRatesFromExternalApi(baseCurrency);

    const relevantRates = rates.filter(
      (r) => SUPPORTED_CURRENCIES.includes(r.targetCurrency) && r.targetCurrency !== r.baseCurrency
    );

    for (const rate of relevantRates) {
      await pool.query(
        `INSERT INTO exchange_rates (base_currency, target_currency, rate_value, is_current)
         VALUES ($1, $2, $3, true)`,
        [rate.baseCurrency, rate.targetCurrency, rate.rateValue]
      );
    }

    console.log(`Tasas actualizadas para ${baseCurrency}`);
  }
}