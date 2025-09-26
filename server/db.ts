import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { users, medicalReports } from '@shared/schema';

let dburl = "postgres://myuser:mypassword@localhost:5432/mydb"

if (!dburl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = neon(dburl);
export const db = drizzle(sql, { schema: { users, medicalReports } });