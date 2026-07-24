/**
 * Read-only check of dim_report's current contents, before the
 * numeric-report_id migration. Optional CLI arg overrides DB_NAME (e.g. to
 * check P26AICatalyst_Work without touching .env.local's test-DB default),
 * same pattern as scripts/run-migration.ts.
 *
 *   npm run check:dim-report -- P26AICatalyst_Work
 */
import { config } from 'dotenv';
import { join } from 'path';
import sql from 'mssql';

config({ path: join(__dirname, '../.env.local') });

async function main() {
  const { DB_SERVER_IP, DB_SERVER, DB_PORT, DB_NAME: DB_NAME_ENV, DB_USER, DB_PASSWORD } = process.env;
  const server = DB_SERVER_IP || DB_SERVER;
  const DB_NAME = process.argv[2] || DB_NAME_ENV;

  if (!server || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    console.error('Missing DB_SERVER / DB_SERVER_IP / DB_NAME / DB_USER / DB_PASSWORD — fill in .env.local first.');
    process.exit(1);
  }

  console.log(`Connecting to ${server}:${DB_PORT ?? 1433}/${DB_NAME}...`);
  const pool = await sql.connect({
    server,
    port: Number(DB_PORT ?? 1433),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });

  console.log(`\n📊 dim_report contents (${DB_NAME}):\n`);
  const result = await pool.request().query(`
    SELECT report_key, report_id, report_name, is_active, created_at_utc, updated_at_utc
    FROM dim_report
    ORDER BY report_key
  `);

  if (result.recordset.length === 0) {
    console.log('❌ No rows.');
  } else {
    result.recordset.forEach((row: any) => {
      console.log(`  [key=${row.report_key}] report_id="${row.report_id}" | name="${row.report_name}" | active=${row.is_active} | created=${row.created_at_utc}`);
    });
    console.log(`\n✅ Total: ${result.recordset.length} row(s)`);
  }

  console.log('\n📊 comment_entry rows referencing each report_key:\n');
  const counts = await pool.request().query(`
    SELECT report_key, COUNT(*) AS n
    FROM comment_entry
    GROUP BY report_key
  `);
  if (counts.recordset.length === 0) {
    console.log('  (none)');
  } else {
    counts.recordset.forEach((row: any) => console.log(`  report_key=${row.report_key}: ${row.n} comment(s)`));
  }

  await pool.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
