import 'dotenv/config';
import { z } from 'zod';
import { createDatabase } from '../src/database.js';
import { email, seedPractice } from './fixtures.js';
import { seedLibrary } from './library.js';
import { seedStaff } from './staff.js';

if (process.env.NODE_ENV === 'production') throw new Error('Practice fixtures require a local development database.');
const url = z.url().parse(process.env.DATABASE_URL);
const database = new URL(url);
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname);
const compose = process.env.PRACTICE_COMPOSE_SEED === '1' && database.hostname === 'postgres' && database.pathname === '/practice';
if (!loopback && !compose) {
  throw new Error('Practice fixtures require the local or Compose development database.');
}
const password = z.string().min(12).max(72).parse(process.env.PRACTICE_SEED_PASSWORD);
const db = createDatabase(url);
try {
  await seedPractice(db, password);
  await seedLibrary(db);
  const staffPassword = process.env.PRACTICE_STAFF_PASSWORD;
  if (staffPassword) await seedStaff(db, z.string().min(12).max(72).parse(staffPassword));
  console.log('Seeded practice sign-in for ' + email);
} finally {
  await db.$disconnect();
}
