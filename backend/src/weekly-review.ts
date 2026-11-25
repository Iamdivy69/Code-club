import { config } from 'dotenv';
import { setTimeout } from 'node:timers/promises';
import { createDatabase } from './database.js';
import { smtpDelivery } from './modules/notifications/smtp.js';
import { sendWeeklyReviews, weeklyReviewGenerator } from './modules/study/weekly-review.js';

config({ quiet: true });
const send = process.argv.includes('--send');
const watch = process.argv.includes('--watch');
const { DATABASE_URL, PRACTICE_ENABLED, PRACTICE_WEEKLY_REVIEW_ENABLED, EMAIL_ENABLED, NODE_ENV } = process.env;
if (!DATABASE_URL || PRACTICE_ENABLED !== 'true') throw new Error('Enable Practice and set DATABASE_URL before running weekly reviews.');
if (watch && !send) throw new Error('Watch mode requires --send.');

const delivery = async () => {
  if (!send) return null;
  if (PRACTICE_WEEKLY_REVIEW_ENABLED !== 'true' || EMAIL_ENABLED === 'false') throw new Error('Weekly review delivery is disabled.');
  const review = weeklyReviewGenerator();
  if (!review) throw new Error('Configure the coaching provider before enabling weekly reviews.');
  const mail = smtpDelivery(process.env, NODE_ENV === 'production');
  await mail.verify();
  return { review, site: mail.site, send: mail.send };
};

const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
const db = createDatabase(DATABASE_URL);
try {
  do {
    try {
      const result = await sendWeeklyReviews(db, await delivery());
      if (!watch || result.eligible || result.errors || result.unconfirmed) console.log(JSON.stringify(result));
      if (!watch && (result.errors || result.unconfirmed)) process.exitCode = 1;
    } catch {
      console.error('Weekly review sweep failed. Check the database, provider, and SMTP settings.');
      if (!watch) process.exitCode = 1;
    }
    if (watch && !controller.signal.aborted) {
      await setTimeout(3_600_000, undefined, { signal: controller.signal }).catch((error: unknown) => {
        if (!controller.signal.aborted) throw error;
      });
    }
  } while (watch && !controller.signal.aborted);
} finally {
  await db.$disconnect();
}
