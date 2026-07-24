import type { ConnectionPool } from 'mssql';

/**
 * No verified auth (Entra/Windows Auth both dropped, see decisions.log.md
 * 22/07/2026) -- clientToken is a random per-browser id (localStorage), and
 * displayName is either what the user typed into the mandatory "Usuario"
 * field, or a username TARGIT itself supplied via the launch URL
 * (targitUsername non-null). Neither source is a cryptographic security
 * boundary, but a TARGIT-supplied username is materially harder to fake
 * (requires deliberately editing the URL) than free text, and is stable
 * across devices -- see resolveUser below for how that changes the lookup.
 */
export interface Identity {
  clientToken: string;
  displayName: string;
  targitUsername: string | null;
}

export interface CommentRow {
  commentEntryKey: number;
  commentText: string;
  createdAtUtc: string;
  authorDisplayName: string | null;
  appUserKey: number;
}

/**
 * Thrown when a reportId isn't a registered dim_report row (or is
 * deactivated). Reports are now DWH-registered ahead of time -- inserted
 * directly into dim_report before a report's TARGIT webbox URL is wired up
 * (see db/migrations/007_numeric_report_id.sql) -- so an unrecognized id is
 * a real error to surface, not something to silently auto-create.
 */
export class ReportNotFoundError extends Error {}

/**
 * Resolve FR: find dim_report by its numeric reportId. reportName, when
 * present, is TARGIT's own live report title ({$Title}) -- recorded as a
 * monitoring snapshot only (targit_title_last_seen), never used to create or
 * rename a row. Best-effort: a failed snapshot update never blocks the
 * resolve itself.
 */
export async function resolveReport(pool: ConnectionPool, reportId: number, reportName?: string): Promise<number> {
  const existing = await pool
    .request()
    .input('reportId', reportId)
    .query('SELECT report_key FROM dim_report WHERE report_id = @reportId AND is_active = 1');

  if (existing.recordset.length === 0) {
    throw new ReportNotFoundError(`Informe no registrado o inactivo: reportId=${reportId}`);
  }

  const reportKey = existing.recordset[0].report_key as number;

  if (reportName) {
    try {
      await pool
        .request()
        .input('reportKey', reportKey)
        .input('reportName', reportName)
        .query(
          `UPDATE dim_report
           SET targit_title_last_seen = @reportName, targit_title_last_seen_at_utc = SYSUTCDATETIME()
           WHERE report_key = @reportKey`
        );
    } catch (err) {
      console.error('Non-fatal: failed to update targit_title_last_seen', err);
    }
  }

  return reportKey;
}

/**
 * Resolve FR: find-or-create the app_user row, choosing the lookup key by
 * how trustworthy the identity source is.
 *
 * - TARGIT-supplied username (identity.targitUsername set): key on THAT,
 *   not client_token. It's the same real person regardless of which device
 *   or browser they're on, so this is what makes "delete my own comment"
 *   work correctly across devices for TARGIT-vouched users, and it's not
 *   just a free-text string someone else could accidentally collide with.
 * - No TARGIT username (manual typing, current default): key on
 *   client_token as before -- deliberately NOT on the typed display name,
 *   since two different people could type the same name and that would let
 *   one delete the other's comments.
 *
 * Either way, a non-empty displayName always overwrites the stored name (the
 * latest thing on record); a bare view-only GET before anything's been typed
 * omits it and must not clobber a name already on file.
 */
export async function resolveUser(pool: ConnectionPool, identity: Identity): Promise<number> {
  if (identity.targitUsername) {
    return resolveByTargitUsername(pool, identity.targitUsername, identity.displayName);
  }
  return resolveByClientToken(pool, identity.clientToken, identity.displayName);
}

async function resolveByTargitUsername(pool: ConnectionPool, targitUsername: string, displayName: string): Promise<number> {
  const existing = await pool
    .request()
    .input('targitUsername', targitUsername)
    .query('SELECT app_user_key FROM app_user WHERE targit_username = @targitUsername');

  if (existing.recordset.length > 0) {
    const key = existing.recordset[0].app_user_key as number;
    const req = pool.request().input('appUserKey', key);
    if (displayName) {
      await req
        .input('displayName', displayName)
        .query('UPDATE app_user SET display_name = @displayName, last_login_at_utc = SYSUTCDATETIME() WHERE app_user_key = @appUserKey');
    } else {
      await req.query('UPDATE app_user SET last_login_at_utc = SYSUTCDATETIME() WHERE app_user_key = @appUserKey');
    }
    return key;
  }

  const created = await pool
    .request()
    .input('targitUsername', targitUsername)
    .input('displayName', displayName || targitUsername)
    .query(
      `INSERT INTO app_user (targit_username, display_name)
       OUTPUT INSERTED.app_user_key
       VALUES (@targitUsername, @displayName)`
    );

  return created.recordset[0].app_user_key as number;
}

async function resolveByClientToken(pool: ConnectionPool, clientToken: string, displayName: string): Promise<number> {
  const existing = await pool
    .request()
    .input('clientToken', clientToken)
    .query('SELECT app_user_key FROM app_user WHERE client_token = @clientToken');

  if (existing.recordset.length > 0) {
    const key = existing.recordset[0].app_user_key as number;
    const req = pool.request().input('appUserKey', key);
    if (displayName) {
      await req
        .input('displayName', displayName)
        .query('UPDATE app_user SET display_name = @displayName, last_login_at_utc = SYSUTCDATETIME() WHERE app_user_key = @appUserKey');
    } else {
      await req.query('UPDATE app_user SET last_login_at_utc = SYSUTCDATETIME() WHERE app_user_key = @appUserKey');
    }
    return key;
  }

  const created = await pool
    .request()
    .input('clientToken', clientToken)
    .input('displayName', displayName || 'Sin nombre')
    .query(
      `INSERT INTO app_user (client_token, display_name)
       OUTPUT INSERTED.app_user_key
       VALUES (@clientToken, @displayName)`
    );

  return created.recordset[0].app_user_key as number;
}

/**
 * FR3/FR4/FR8: shared comment history for a report/product/month selection,
 * newest first. Scoped to the period too (22/07/2026) -- a comment explains a
 * deviation in a specific month, so the thread a user sees must be the one
 * for the cell they clicked, never a mix of every month's comments.
 */
export async function loadComments(
  pool: ConnectionPool,
  reportKey: number,
  productId: string,
  periodId: string
): Promise<CommentRow[]> {
  const result = await pool
    .request()
    .input('reportKey', reportKey)
    .input('productId', productId)
    .input('periodId', periodId)
    .query(
      `SELECT
         c.comment_entry_key,
         c.comment_text,
         c.created_at_utc,
         c.app_user_key,
         u.display_name
       FROM comment_entry c
       JOIN app_user u ON u.app_user_key = c.app_user_key
       WHERE c.report_key = @reportKey
         AND c.product_id = @productId
         AND c.period_id = @periodId
         AND c.is_deleted = 0
       ORDER BY c.created_at_utc DESC`
    );

  return result.recordset.map((r) => ({
    commentEntryKey: r.comment_entry_key,
    commentText: r.comment_text,
    createdAtUtc: r.created_at_utc,
    authorDisplayName: r.display_name,
    appUserKey: r.app_user_key,
  }));
}

export interface SaveCommentParams {
  reportKey: number;
  productId: string;
  /** Normalized YYYYMM -- part of the comment's identity, not just context. */
  periodId: string;
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
    .input('periodId', params.periodId)
    .input('productName', params.productName ?? null)
    .input('brand', params.brand ?? null)
    .input('fragrance', params.fragrance ?? null)
    .input('periodLabel', params.periodLabel ?? null)
    .input('appUserKey', params.appUserKey)
    .input('commentText', params.commentText)
    .query(
      `INSERT INTO comment_entry
         (report_key, product_id, period_id, product_name_snapshot, brand_snapshot, fragrance_snapshot, period_label_snapshot, app_user_key, comment_text)
       OUTPUT INSERTED.comment_entry_key
       VALUES (@reportKey, @productId, @periodId, @productName, @brand, @fragrance, @periodLabel, @appUserKey, @commentText)`
    );

  return result.recordset[0].comment_entry_key as number;
}

/**
 * Soft-delete: only the comment's own author may hide it (ownership checked
 * in the WHERE clause, not just the app layer). Row stays in the DB for
 * audit -- this is a UI-level "hide from view", not an actual delete.
 */
export async function softDeleteComment(pool: ConnectionPool, commentEntryKey: number, requestingUserKey: number): Promise<boolean> {
  const result = await pool
    .request()
    .input('commentEntryKey', commentEntryKey)
    .input('requestingUserKey', requestingUserKey)
    .query(
      `UPDATE comment_entry
       SET is_deleted = 1, deleted_at_utc = SYSUTCDATETIME(), deleted_by_user_key = @requestingUserKey
       WHERE comment_entry_key = @commentEntryKey
         AND app_user_key = @requestingUserKey
         AND is_deleted = 0`
    );

  return result.rowsAffected[0] > 0;
}
