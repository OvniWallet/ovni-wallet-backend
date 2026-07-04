import { Pool } from 'pg';
import { ENV } from './env';
import { logger } from './logger';

export const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
});

pool.on('connect', () => {
  logger.info('Database pool connected successfully');
});
