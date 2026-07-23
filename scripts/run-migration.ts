/**
 * Runs a DDL migration file against the on-prem SQL Server. Splits on `GO`
 * batch separators (not valid T-SQL, sqlcmd/SSMS-only) since the mssql
 * driver executes one batch per request.
 *
 *   npm run migrate -- db/migrations/001_phase1_schema.sql
 *   npm run migrate -- db/migrations/001_phase1_schema.sql P26AICatalyst_Work
 *
 * Reads DB_SERVER_IP/DB_NAME/DB_USER/DB_PASSWORD from .env.local. An optional
 * second CLI arg overrides DB_NAME for this run only, so the production
 * database (P26AICatalyst_Work) can be targeted without touching .env.local's
 * DB_NAME, which the other dev scripts (test-db-local, check-usage-log) keep
 * pointed at the test DB (P26AICatalyst). Requires the VPN connection to
 * PYD's domain to be active.
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sql from 'mssql';

config({ path: join(__dirname, '../.env.local') });

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run migrate -- <path-to-sql-file>');
    process.exit(1);
  }

  const { DB_SERVER_IP, DB_SERVER, DB_PORT, DB_NAME: DB_NAME_ENV, DB_USER, DB_PASSWORD, DB_TRUST_SERVER_CERTIFICATE } = process.env;
  const server = DB_SERVER_IP || DB_SERVER;
  const DB_NAME = process.argv[3] || DB_NAME_ENV;

  if (!server || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    console.error('Missing DB_SERVER / DB_SERVER_IP / DB_NAME / DB_USER / DB_PASSWORD — fill in .env.local first.');
    process.exit(1);
  }

  const raw = readFileSync(filePath, 'utf8');
  const batches = raw
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.replace(/--.*$/gm, '').trim().length > 0);

  console.log(`Connecting to ${server}:${DB_PORT ?? 1433}/${DB_NAME} as ${DB_USER}...`);
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
  console.log(`🟢 Connected. Running ${filePath} (${batches.length} batch(es))...\n`);

  for (const [i, batch] of batches.entries()) {
    const firstLine = batch.split('\n').find((l) => l.trim() && !l.trim().startsWith('--')) ?? '(comment-only batch, skipped)';
    process.stdout.write(`  [${i + 1}/${batches.length}] ${firstLine.slice(0, 70)}... `);
    try {
      await pool.request().batch(batch);
      console.log('OK');
    } catch (err: any) {
      console.log('FAILED');
      console.error(`\n🔴 Batch ${i + 1} failed:`, err.message);
      await pool.close();
      process.exit(1);
    }
  }

  console.log('\n🟢 Migration completed successfully.');
  await pool.close();
}

main().catch((err) => {
  console.error('🔴 Migration failed:', err.message);
  process.exit(1);
});
