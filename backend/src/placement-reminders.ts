import { config } from 'dotenv';
import { setTimeout } from 'node:timers/promises';
import { createDatabase } from './database.js';
import { sendAutomaticReminders } from './modules/placement/assignment-notices.js';

config({ quiet: true });
const watch = process.argv.includes('--watch');
const connection = process.env.DATABASE_URL;
if (!connection || process.env.PRACTICE_ENABLED !== 'true') {
  throw new Error('Set DATABASE_URL and enable Practice before running assignment reminders.');
}

const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
const db = createDatabase(connection);
try {
  do {
    try {
      const result = await sendAutomaticReminders(db);
      if (!watch || result.handled || result.errors) console.log(JSON.stringify(result));
      if (!watch && result.errors) process.exitCode = 1;
    } catch {
      console.error('The assignment reminder sweep failed.');
      if (!watch) process.exitCode = 1;
    }
    if (watch && !controller.signal.aborted) {
      await setTimeout(300_000, undefined, { signal: controller.signal }).catch((error: unknown) => {
        if (!controller.signal.aborted) throw error;
      });
    }
  } while (watch && !controller.signal.aborted);
} finally {
  await db.$disconnect();
}
