import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { parseContext, ContextValidationError } from '@/lib/context';
import { resolveMockIdentity } from '@/lib/mock-auth';
import { resolveReport, resolveUser, loadComments, saveComment } from '@/lib/comments';

// FR1/FR2/FR3/FR8: receive context, resolve report+user, return context + shared history.
export async function GET(req: NextRequest) {
  try {
    const context = parseContext(req.nextUrl.searchParams);
    const identity = resolveMockIdentity(req.nextUrl.searchParams.get('asUser'));

    const pool = await getPool();
    const reportKey = await resolveReport(pool, context.reportId, context.reportName);
    await resolveUser(pool, identity); // FR: resolve/create local user record even on view-only load

    const comments = await loadComments(pool, reportKey, context.productId);

    return NextResponse.json({ context, viewingAs: identity.displayName, comments });
  } catch (err) {
    if (err instanceof ContextValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'SQL connectivity or query failure.' }, { status: 500 });
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
      return NextResponse.json({ error: 'Missing required field: commentText' }, { status: 400 });
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

    return NextResponse.json({ commentEntryKey, comments }, { status: 201 });
  } catch (err) {
    if (err instanceof ContextValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Save failed.' }, { status: 500 });
  }
}
