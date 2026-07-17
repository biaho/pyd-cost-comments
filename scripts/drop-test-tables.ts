/**
 * One-off cleanup: drops the pyd-cost-comments Phase 1 + usage-log tables
 * from the TEST DB (P26AICatalyst) so they can be recreated cleanly against
 * the production DB (P26AICatalyst_Work) once access lands.
 *
 * The creation DDL is preserved unchanged in db/migrations/001_phase1_schema.sql
 * and db/migrations/002_transcription_usage_log.sql — re-run both via
 * `npm run migrate -- db/migrations/00X_....sql` against the new target to
 * recreate everything exactly as it was.
 *
 * Drops in FK-safe order (children before parents). Leaves demo_table and
 * anything else in the DB untouched.
 */
import { config } from 'dotenv';
import { join } from 'node:path';
import sql from 'mssql';

config({ path: join(__dirname, '../.env.local') });

const TABLES_IN_DROP_ORDER = [
  'comment_entry',
  'transcription_usage_log',
  'app_user',
  'dim_report',
];

async function main(): Promise<void> {
  const { DB_SERVER_IP, DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_TRUST_SERVER_CERTIFICATE } = process.env;
  const server = DB_SERVER_IP || DB_SERVER;

  if (!server || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    console.error('Missing DB_SERVER / DB_SERVER_IP / DB_NAME / DB_USER / DB_PASSWORD — fill in .env.local first.');
    process.exit(1);
  }

  console.log(`Connecting to ${server}:${DB_PORT ?? 1433}/${DB_NAME}...`);
  const pool = await sql.connect({
    server,
    port: DB_PORT ? Number(DB_PORT) : 1433,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    options: {
      trustServerCertificate: DB_TRUST_SERVER_CERTIFICATE === 'true',
      encrypt: true,
    },
  });
  console.log('🟢 Connected.\n');

  for (const table of TABLES_IN_DROP_ORDER) {
    process.stdout.write(`  Dropping ${table}... `);
    try {
      await pool.request().batch(`IF OBJECT_ID('dbo.${table}', 'U') IS NOT NULL DROP TABLE dbo.${table};`);
      console.log('OK');
    } catch (err: any) {
      console.log('FAILED');
      console.error(`\n🔴 Drop of ${table} failed:`, err.message);
      await pool.close();
      process.exit(1);
    }
  }

  console.log('\nVerifying remaining tables in the DB...');
  const result = await pool.request().query('SELECT name FROM sys.tables ORDER BY name;');
  console.log(result.recordset.map((r: { name: string }) => `  - ${r.name}`).join('\n'));

  await pool.close();
  console.log('\n🟢 Cleanup completed.');
}

main().catch((err) => {
  console.error('🔴 Cleanup failed:', err.message);
  process.exit(1);
});
