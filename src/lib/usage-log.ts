import type { ConnectionPool } from 'mssql';

export interface TranscriptionUsageParams {
  appUserKey: number;
  characters: number;
  durationSecondsEst?: number;
  costUsd: number;
  model: string;
}

export async function logTranscriptionUsage(pool: ConnectionPool, params: TranscriptionUsageParams): Promise<void> {
  await pool
    .request()
    .input('appUserKey', params.appUserKey)
    .input('characters', params.characters)
    .input('durationSecondsEst', params.durationSecondsEst ?? null)
    .input('costUsd', params.costUsd)
    .input('model', params.model)
    .query(
      `INSERT INTO transcription_usage_log (app_user_key, characters, duration_seconds_est, cost_usd, model)
       VALUES (@appUserKey, @characters, @durationSecondsEst, @costUsd, @model)`
    );
}
