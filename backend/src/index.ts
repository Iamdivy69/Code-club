import 'dotenv/config';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabase } from './database.js';

const config = readConfig();
const db = createDatabase(config.DATABASE_URL);
const app = createApp(db, config);
app.addHook('onClose', () => db.$disconnect());

try {
  await db.$connect();
  await app.listen({ host: config.PRACTICE_API_HOST ?? '127.0.0.1', port: config.PORT });
  process.once('SIGINT', () => void app.close());
  process.once('SIGTERM', () => void app.close());
} catch {
  console.error('The API could not start. Check the local database and API port.');
  await app.close();
  process.exitCode = 1;
}
