import app from './app';
import { ENV } from './config/env';
import { logger } from './config/logger';

const PORT = ENV.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
