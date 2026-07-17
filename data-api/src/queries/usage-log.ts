import type { ConnectionPool } from 'mssql';

export interface TranscriptionUsageParams {
  appUserKey: number;
  callType?: string;
  characters: number;
  durationSecondsEst?: number;
  costUsd: number;
  model: string;
}

export async function logTranscriptionUsage(pool: ConnectionPool, params: TranscriptionUsageParams): Promise<void> {
  await pool
    .request()
    .input('appUserKey', params.appUserKey)
    .input('callType', params.callType ?? 'stt')
    .input('characters', params.characters)
    .input('durationSecondsEst', params.durationSecondsEst ?? null)
    .input('costUsd', params.costUsd)
    .input('model', params.model)
    .query(
      `INSERT INTO transcription_usage_log (app_user_key, call_type, characters, duration_seconds_est, cost_usd, model)
       VALUES (@appUserKey, @callType, @characters, @durationSecondsEst, @costUsd, @model)`
    );
}

export interface UsageLogRow {
  id: number;
  userId: number;
  displayName: string | null;
  userPrincipalName: string | null;
  callType: string;
  apiProvider: string | null;
  characters: number | null;
  durationSeconds: number | null;
  costUsd: number | null;
  model: string | null;
  createdAt: string;
}

/** Admin usage dashboard: joins app_user so the client never needs a separate identity lookup. */
export async function loadUsageLog(
  pool: ConnectionPool,
  range?: { start?: Date; end?: Date }
): Promise<UsageLogRow[]> {
  const request = pool.request();
  const conditions: string[] = [];

  if (range?.start) {
    request.input('start', range.start);
    conditions.push('t.created_at_utc >= @start');
  }
  if (range?.end) {
    request.input('end', range.end);
    conditions.push('t.created_at_utc <= @end');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await request.query(
    `SELECT
       t.usage_log_key       AS id,
       t.app_user_key        AS user_id,
       u.display_name,
       u.user_principal_name,
       t.call_type,
       t.api_provider,
       t.characters,
       t.duration_seconds_est AS duration_seconds,
       t.cost_usd,
       t.model,
       t.created_at_utc      AS created_at
     FROM transcription_usage_log t
     JOIN app_user u ON u.app_user_key = t.app_user_key
     ${where}
     ORDER BY t.created_at_utc DESC`
  );

  return result.recordset.map((r) => ({
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    userPrincipalName: r.user_principal_name,
    callType: r.call_type,
    apiProvider: r.api_provider,
    characters: r.characters,
    durationSeconds: r.duration_seconds,
    costUsd: r.cost_usd,
    model: r.model,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
