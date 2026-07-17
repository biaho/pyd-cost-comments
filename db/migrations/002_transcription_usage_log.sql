-- Phase 1 addition: usage/cost tracking for speech-to-text calls (ElevenLabs).
-- Mirrors the shape of pyd-audio-studio's Supabase `api_usage` table, adapted
-- to this project's own SQL Server DB and app_user table (no Supabase here).
--
-- TEST/DEV RUN target: P26AICatalyst.
-- PRODUCTION target: P26AICatalyst_Work (access pending) -- re-run there once
-- access lands. Do not run against either DB without explicit sign-off.

CREATE TABLE transcription_usage_log (
    usage_log_key       BIGINT IDENTITY(1,1) NOT NULL,
    app_user_key         BIGINT          NOT NULL,
    call_type            NVARCHAR(50)   NOT NULL CONSTRAINT DF_transcription_usage_log_call_type DEFAULT ('stt'),
    characters            INT            NOT NULL CONSTRAINT DF_transcription_usage_log_characters DEFAULT (0),
    duration_seconds_est  DECIMAL(10,2)  NULL,
    cost_usd              DECIMAL(10,6)  NOT NULL CONSTRAINT DF_transcription_usage_log_cost_usd DEFAULT (0),
    model                 NVARCHAR(50)   NOT NULL,
    api_provider          NVARCHAR(50)   NOT NULL CONSTRAINT DF_transcription_usage_log_api_provider DEFAULT ('elevenlabs'),
    created_at_utc        DATETIME2      NOT NULL CONSTRAINT DF_transcription_usage_log_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_transcription_usage_log PRIMARY KEY CLUSTERED (usage_log_key),
    CONSTRAINT FK_transcription_usage_log_user FOREIGN KEY (app_user_key) REFERENCES app_user (app_user_key)
);
GO

-- Per-user spend/volume lookups, newest first
CREATE INDEX IX_transcription_usage_log_user_created
    ON transcription_usage_log (app_user_key, created_at_utc DESC);
GO
