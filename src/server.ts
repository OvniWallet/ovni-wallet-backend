import app from './app';
import { ENV } from './config/env';
import { logger } from './config/logger';
import { testDatabaseConnection } from './db/pool';

const PORT = ENV.PORT || 5000;

testDatabaseConnection()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error('No se pudo conectar a la DB:', err);
    process.exit(1);
  });