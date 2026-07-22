import { NextRequest, NextResponse } from 'next/server';
import { parseContext, ContextValidationError } from '@/lib/context';
import { resolveIdentity, AuthError } from '@/lib/auth';
import { resolveReport, resolveUser, resolveProduct, loadComments, saveComment, softDeleteComment, type CommentRow } from '@/lib/data-api-client';

function withOwnership(comments: CommentRow[], currentUserKey: number) {
  return comments.map(({ appUserKey, ...rest }) => ({ ...rest, isOwnComment: appUserKey === currentUserKey }));
}

// FR1/FR2/FR3/FR8: receive context, resolve report+user, return context + shared history.
export async function GET(req: NextRequest) {
  try {
    const context = parseContext(req.nextUrl.searchParams);
    const identity = resolveIdentity(req.nextUrl.searchParams);

    const reportKey = await resolveReport(context.reportId);
    const appUserKey = await resolveUser(identity); // FR: resolve/create local user record even on view-only load
    const product = await resolveProduct(context.productId);

    const comments = await loadComments(reportKey, context.productId);

    return NextResponse.json({ context, product, viewingAs: identity.displayName, comments: withOwnership(comments, appUserKey) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
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
    const identity = resolveIdentity(body);

    if (!identity.displayName) {
      return NextResponse.json({ error: 'Falta el campo obligatorio: usuario' }, { status: 400 });
    }

    const commentText = typeof body.commentText === 'string' ? body.commentText.trim() : '';
    if (!commentText) {
      return NextResponse.json({ error: 'Falta el campo obligatorio: commentText' }, { status: 400 });
    }

    const reportKey = await resolveReport(context.reportId);
    const appUserKey = await resolveUser(identity);
    const product = await resolveProduct(context.productId);

    const commentEntryKey = await saveComment({
      reportKey,
      productId: context.productId,
      productName: product?.productName ?? undefined,
      brand: product?.brand ?? undefined,
      fragrance: product?.fragrance ?? undefined,
      appUserKey,
      commentText,
    });

    const comments = await loadComments(reportKey, context.productId);

    return NextResponse.json({ commentEntryKey, comments: withOwnership(comments, appUserKey) }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ContextValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Error al guardar el comentario.' }, { status: 500 });
  }
}

// Soft-delete: hide a comment from the shared view. Only the author can hide their own
// (enforced in the on-prem API's SQL WHERE clause, not just here). Row stays in the DB for audit.
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const context = parseContext(body);
    const identity = resolveIdentity(body);
    const commentEntryKey = Number(body.commentEntryKey);

    if (!commentEntryKey) {
      return NextResponse.json({ error: 'Falta el campo obligatorio: commentEntryKey' }, { status: 400 });
    }

    const reportKey = await resolveReport(context.reportId);
    const appUserKey = await resolveUser(identity);

    const deleted = await softDeleteComment(commentEntryKey, appUserKey);
    if (!deleted) {
      return NextResponse.json({ error: 'Comentario no encontrado, ya eliminado, o no pertenece a este usuario.' }, { status: 403 });
    }

    const comments = await loadComments(reportKey, context.productId);

    return NextResponse.json({ comments: withOwnership(comments, appUserKey) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ContextValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Error al eliminar el comentario.' }, { status: 500 });
  }
}
