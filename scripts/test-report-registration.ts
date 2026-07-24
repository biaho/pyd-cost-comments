/**
 * One-off verification that the new DWH-facing registration workflow works:
 * INSERT (report_name only) OUTPUT INSERTED.report_id auto-assigns from the
 * sequence. Inserts a throwaway row, confirms it, then deletes it (no
 * comment_entry FK on it, so a plain DELETE is safe).
 */
import { config } from 'dotenv';
import { join } from 'path';
import sql from 'mssql';

config({ path: join(__dirname, '../.env.local') });

async function main() {
  const { DB_SERVER_IP, DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD } = process.env;
  const server = DB_SERVER_IP || DB_SERVER;
  const DB_NAME = process.argv[2] || 'P26AICatalyst_Work';

  const pool = await sql.connect({
    server: server!,
    port: Number(DB_PORT ?? 1433),
    database: DB_NAME,
    user: DB_USER!,
    password: DB_PASSWORD!,
    options: { trustServerCertificate: true, encrypt: true },
  });

  console.log(`Testing against ${DB_NAME}...\n`);

  const insertResult = await pool.request().query(`
    INSERT INTO dim_report (report_name)
    OUTPUT INSERTED.report_key, INSERTED.report_id, INSERTED.report_name
    VALUES (N'TEST — registro DWH (borrar)')
  `);
  const row = insertResult.recordset[0];
  console.log(`✅ Insert worked: report_key=${row.report_key}, report_id=${row.report_id} (auto-assigned), report_name="${row.report_name}"`);

  await pool.request().input('key', row.report_key).query('DELETE FROM dim_report WHERE report_key = @key');
  console.log('🧹 Test row deleted.');

  await pool.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
