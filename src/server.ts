import app from './app';
import { ENV } from './config/env';
import { logger } from './config/logger';
import { testDatabaseConnection } from './db/pool';
import { fetchAndStoreExchangeRates } from './jobs/fetch-exchange-rates.job';

const PORT = ENV.PORT || 5000;

testDatabaseConnection()
  .then(() => fetchAndStoreExchangeRates())
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error('Error al iniciar el server:', err);
    process.exit(1);
  });