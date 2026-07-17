import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity, AuthError } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { loadUsageLog } from '@/lib/data-api-client';

export async function GET(req: NextRequest) {
  try {
    const identity = await resolveIdentity(req);
    if (!isAdmin(identity)) {
      return NextResponse.json(
        { error: 'Acceso denegado. Esta página solo es accesible para administradores.' },
        { status: 403 }
      );
    }

    const startParam = req.nextUrl.searchParams.get('start');
    const endParam = req.nextUrl.searchParams.get('end');

    const rows = await loadUsageLog({
      start: startParam ? new Date(startParam) : undefined,
      end: endParam ? new Date(endParam) : undefined,
    });

    return NextResponse.json({ rows });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Error al cargar el uso de la API.' }, { status: 500 });
  }
}
