
const BASE_URL = "https://v6.exchangerate-api.com/v6";
const TIMEOUT_MS = 5000;

interface ExchangeRateApiResponse {
  result: string;
  base_code: string;
  conversion_rates: Record<string, number>;
}

export interface FetchedRate {
  baseCurrency: string;
  targetCurrency: string;
  rateValue: number;
}

export async function fetchRatesFromExternalApi(baseCurrency: string): Promise<FetchedRate[]> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    throw new Error("Falta EXCHANGE_RATE_API_KEY en el .env");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/${apiKey}/latest/${baseCurrency}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Exchange Rate API respondio ${response.status}`);
    }

    const data = (await response.json()) as ExchangeRateApiResponse;

    if (data.result !== "success") {
      throw new Error("Exchange Rate API devolvio result != success");
    }

    return Object.entries(data.conversion_rates).map(([targetCurrency, rateValue]) => ({
      baseCurrency,
      targetCurrency,
      rateValue,
    }));
  } finally {
    clearTimeout(timeout);
  }
}