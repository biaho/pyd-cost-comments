import type { ConnectionPool } from 'mssql';
import type { MockIdentity } from './mock-auth';

export interface CommentRow {
  commentEntryKey: number;
  commentText: string;
  createdAtUtc: string;
  authorDisplayName: string | null;
  authorUserPrincipalName: string | null;
}

/** Resolve FR: find dim_report by reportId, create it if this is the first time we see it. */
export async function resolveReport(pool: ConnectionPool, reportId: string, reportName?: string): Promise<number> {
  const existing = await pool
    .request()
    .input('reportId', reportId)
    .query('SELECT report_key FROM dim_report WHERE report_id = @reportId');

  if (existing.recordset.length > 0) {
    return existing.recordset[0].report_key as number;
  }

  const created = await pool
    .request()
    .input('reportId', reportId)
    .input('reportName', reportName ?? reportId)
    .query(
      'INSERT INTO dim_report (report_id, report_name) OUTPUT INSERTED.report_key VALUES (@reportId, @reportName)'
    );

  return created.recordset[0].report_key as number;
}

/** Resolve FR: find app_user by entra_object_id, create on first login, else bump last_login_at_utc. */
export async function resolveUser(pool: ConnectionPool, identity: MockIdentity): Promise<number> {
  const existing = await pool
    .request()
    .input('entraObjectId', identity.entraObjectId)
    .query('SELECT app_user_key FROM app_user WHERE entra_object_id = @entraObjectId');

  if (existing.recordset.length > 0) {
    const key = existing.recordset[0].app_user_key as number;
    await pool
      .request()
      .input('appUserKey', key)
      .query('UPDATE app_user SET last_login_at_utc = SYSUTCDATETIME() WHERE app_user_key = @appUserKey');
    return key;
  }

  const created = await pool
    .request()
    .input('entraObjectId', identity.entraObjectId)
    .input('userPrincipalName', identity.userPrincipalName)
    .input('displayName', identity.displayName)
    .query(
      `INSERT INTO app_user (entra_object_id, user_principal_name, display_name)
       OUTPUT INSERTED.app_user_key
       VALUES (@entraObjectId, @userPrincipalName, @displayName)`
    );

  return created.recordset[0].app_user_key as number;
}

/** FR3/FR4/FR8: shared comment history for a report/product selection, newest first. */
export async function loadComments(pool: ConnectionPool, reportKey: number, productId: string): Promise<CommentRow[]> {
  const result = await pool
    .request()
    .input('reportKey', reportKey)
    .input('productId', productId)
    .query(
      `SELECT
         c.comment_entry_key,
         c.comment_text,
         c.created_at_utc,
         u.display_name,
         u.user_principal_name
       FROM comment_entry c
       JOIN app_user u ON u.app_user_key = c.app_user_key
       WHERE c.report_key = @reportKey
         AND c.product_id = @productId
         AND c.is_deleted = 0
       ORDER BY c.created_at_utc DESC`
    );

  return result.recordset.map((r) => ({
    commentEntryKey: r.comment_entry_key,
    commentText: r.comment_text,
    createdAtUtc: r.created_at_utc,
    authorDisplayName: r.display_name,
    authorUserPrincipalName: r.user_principal_name,
  }));
}

export interface SaveCommentParams {
  reportKey: number;
  productId: string;
  productName?: string;
  brand?: string;
  fragrance?: string;
  periodLabel?: string;
  appUserKey: number;
  commentText: string;
}

/** FR5/FR6/FR7: append-only insert, never an overwrite. */
export async function saveComment(pool: ConnectionPool, params: SaveCommentParams): Promise<number> {
  const result = await pool
    .request()
    .input('reportKey', params.reportKey)
    .input('productId', params.productId)
    .input('productName', params.productName ?? null)
    .input('brand', params.brand ?? null)
    .input('fragrance', params.fragrance ?? null)
    .input('periodLabel', params.periodLabel ?? null)
    .input('appUserKey', params.appUserKey)
    .input('commentText', params.commentText)
    .query(
      `INSERT INTO comment_entry
         (report_key, product_id, product_name_snapshot, brand_snapshot, fragrance_snapshot, period_label_snapshot, app_user_key, comment_text)
       OUTPUT INSERTED.comment_entry_key
       VALUES (@reportKey, @productId, @productName, @brand, @fragrance, @periodLabel, @appUserKey, @commentText)`
    );

  return result.recordset[0].comment_entry_key as number;
}
