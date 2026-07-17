/**
 * Local-first smoke test for the on-prem SQL Server connection — proves the
 * VPN + credentials path works before any table/DDL exists. Run from the
 * project root:
 *
 *   npm run test:db
 *
 * Reads DB_SERVER / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD from .env.local
 * (see .env.local.example). Requires the VPN connection to PYD's domain to be
 * active.
 */
import { config } from 'dotenv';
import { join } from 'node:path';
import sql from 'mssql';

config({ path: join(__dirname, '../.env.local') });

async function main(): Promise<void> {
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_TRUST_SERVER_CERTIFICATE } = process.env;

  if (!DB_SERVER || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    console.error('Missing DB_SERVER / DB_NAME / DB_USER / DB_PASSWORD — fill in .env.local first.');
    process.exit(1);
  }

  console.log(`Connecting to ${DB_SERVER}:${DB_PORT ?? 1433}/${DB_NAME} as ${DB_USER}...`);

  const pool = await sql.connect({
    server: DB_SERVER,
    port: DB_PORT ? Number(DB_PORT) : 1433,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    options: {
      trustServerCertificate: DB_TRUST_SERVER_CERTIFICATE === 'true',
      encrypt: true,
    },
  });

  const result = await pool.request().query('SELECT @@VERSION AS version, DB_NAME() AS db_name');
  console.log('🟢 Connected.');
  console.log(`   DB: ${result.recordset[0].db_name}`);
  console.log(`   ${result.recordset[0].version.split('\n')[0]}`);

  await pool.close();
}

main().catch((err) => {
  console.error('🔴 Connection failed:', err.message);
  process.exit(1);
});
