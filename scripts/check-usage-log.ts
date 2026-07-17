import { config } from 'dotenv';
import { join } from 'path';
import sql from 'mssql';

config({ path: join(__dirname, '../.env.local') });

async function main() {
  const { DB_SERVER_IP, DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const server = DB_SERVER_IP || DB_SERVER;

  if (!server || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    console.error('Missing DB_SERVER / DB_SERVER_IP / DB_NAME / DB_USER / DB_PASSWORD — fill in .env.local first.');
    process.exit(1);
  }

  const pool = await sql.connect({
    server,
    port: Number(DB_PORT ?? 1433),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });

  console.log('\n📊 transcription_usage_log contents:\n');
  const result = await pool.request().query(`
    SELECT TOP 10 usage_log_key, app_user_key, call_type, characters, cost_usd, model, created_at_utc
    FROM transcription_usage_log
    ORDER BY created_at_utc DESC
  `);

  if (result.recordset.length === 0) {
    console.log('❌ No log entries found.');
  } else {
    result.recordset.forEach((row: any) => {
      const date = new Date(row.created_at_utc).toLocaleString('es-ES');
      console.log(`  [${row.usage_log_key}] user=${row.app_user_key} | ${row.call_type} | ${row.characters} chars | $${row.cost_usd.toFixed(6)} | model=${row.model} | ${date}`);
    });
    console.log(`\n✅ Total: ${result.recordset.length} entries`);
  }

  await pool.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
