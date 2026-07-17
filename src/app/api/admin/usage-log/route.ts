import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { resolveMockIdentity } from '@/lib/mock-auth';
import { isAdmin } from '@/lib/admin';
import { loadUsageLog } from '@/lib/usage-log';

export async function GET(req: NextRequest) {
  try {
    const identity = resolveMockIdentity(req.nextUrl.searchParams.get('asUser'));
    if (!isAdmin(identity)) {
      return NextResponse.json(
        { error: 'Acceso denegado. Esta página solo es accesible para administradores.' },
        { status: 403 }
      );
    }

    const startParam = req.nextUrl.searchParams.get('start');
    const endParam = req.nextUrl.searchParams.get('end');

    const pool = await getPool();
    const rows = await loadUsageLog(pool, {
      start: startParam ? new Date(startParam) : undefined,
      end: endParam ? new Date(endParam) : undefined,
    });

    return NextResponse.json({ rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al cargar el uso de la API.' }, { status: 500 });
  }
}
