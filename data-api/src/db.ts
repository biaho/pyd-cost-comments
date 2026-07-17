import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool) return pool;

  const server = process.env.DB_SERVER;
  if (!server || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    throw new Error('Missing DB_SERVER / DB_NAME / DB_USER / DB_PASSWORD env vars.');
  }

  pool = await sql.connect({
    server,
    port: Number(process.env.DB_PORT ?? 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      encrypt: true,
    },
  });

  return pool;
}
