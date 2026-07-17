import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { parseContext, ContextValidationError } from '@/lib/context';
import { resolveMockIdentity } from '@/lib/mock-auth';
import { resolveReport, resolveUser, loadComments, saveComment, softDeleteComment, type CommentRow } from '@/lib/comments';

function withOwnership(comments: CommentRow[], currentUserKey: number) {
  return comments.map(({ appUserKey, ...rest }) => ({ ...rest, isOwnComment: appUserKey === currentUserKey }));
}

// FR1/FR2/FR3/FR8: receive context, resolve report+user, return context + shared history.
export async function GET(req: NextRequest) {
  try {
    const context = parseContext(req.nextUrl.searchParams);
    const identity = resolveMockIdentity(req.nextUrl.searchParams.get('asUser'));

    const pool = await getPool();
    const reportKey = await resolveReport(pool, context.reportId, context.reportName);
    const appUserKey = await resolveUser(pool, identity); // FR: resolve/create local user record even on view-only load

    const comments = await loadComments(pool, reportKey, context.productId);

    return NextResponse.json({ context, viewingAs: identity.displayName, comments: withOwnership(comments, appUserKey) });
  } catch (err) {
    if (err instanceof ContextValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Fallo de conexión o consulta a la base de datos.' }, { status: 500 });
  }
}

// FR5/FR6/FR7: save a new comment, never overwrite, allow duplicates across users.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const context = parseContext(body);
    const identity = resolveMockIdentity(body.asUser ?? null);

    const commentText = typeof body.commentText === 'string' ? body.commentText.trim() : '';
    if (!commentText) {
      return NextResponse.json({ error: 'Falta el campo obligatorio: commentText' }, { status: 400 });
    }

    const pool = await getPool();
    const reportKey = await resolveReport(pool, context.reportId, context.reportName);
    const appUserKey = await resolveUser(pool, identity);

    const commentEntryKey = await saveComment(pool, {
      reportKey,
      productId: context.productId,
      productName: context.productName,
      brand: context.brand,
      fragrance: context.fragrance,
      periodLabel: context.periodLabel,
      appUserKey,
      commentText,
    });

    const comments = await loadComments(pool, reportKey, context.productId);

    return NextResponse.json({ commentEntryKey, comments: withOwnership(comments, appUserKey) }, { status: 201 });
  } catch (err) {
    if (err instanceof ContextValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Error al guardar el comentario.' }, { status: 500 });
  }
}

// Soft-delete: hide a comment from the shared view. Only the author can hide their own
// (enforced in the SQL WHERE clause, not just here). Row stays in the DB for audit.
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const context = parseContext(body);
    const identity = resolveMockIdentity(body.asUser ?? null);
    const commentEntryKey = Number(body.commentEntryKey);

    if (!commentEntryKey) {
      return NextResponse.json({ error: 'Falta el campo obligatorio: commentEntryKey' }, { status: 400 });
    }

    const pool = await getPool();
    const reportKey = await resolveReport(pool, context.reportId, context.reportName);
    const appUserKey = await resolveUser(pool, identity);

    const deleted = await softDeleteComment(pool, commentEntryKey, appUserKey);
    if (!deleted) {
      return NextResponse.json({ error: 'Comentario no encontrado, ya eliminado, o no pertenece a este usuario.' }, { status: 403 });
    }

    const comments = await loadComments(pool, reportKey, context.productId);

    return NextResponse.json({ comments: withOwnership(comments, appUserKey) });
  } catch (err) {
    if (err instanceof ContextValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Error al eliminar el comentario.' }, { status: 500 });
  }
}
