-- Drops Entra ID as the app_user identity source (auth dropped entirely, see
-- 02_AI_Agent/clients/PYD/pyd-cost-comments/logs/decisions.log.md 22/07/2026).
-- Users now self-identify via a mandatory "Usuario" field in the composer;
-- app_user rows are keyed on a random per-browser client_token (localStorage)
-- instead of the Entra oid, purely to keep the same visitor's ownership
-- (soft-delete permission, "own comment" styling) stable across sessions.
-- Not an identity guarantee -- anyone can type any name, accepted trade-off.
--
-- Run against the same targets as prior migrations: P26AICatalyst (test,
-- confirmed) then P26AICatalyst_Work (production, once access lands).

-- Backfill any NULL display_name before enforcing NOT NULL below (defensive --
-- Entra always supplied one, but don't assume the test DB has zero nulls).
UPDATE app_user SET display_name = 'Sin nombre' WHERE display_name IS NULL;
GO

ALTER TABLE app_user DROP CONSTRAINT UQ_app_user_entra_object_id;
GO

ALTER TABLE app_user DROP COLUMN entra_object_id;
GO

ALTER TABLE app_user DROP COLUMN user_principal_name;
GO

-- Backfill existing rows with a random token via the same DEFAULT used for new inserts.
ALTER TABLE app_user ADD client_token NVARCHAR(64) NOT NULL
    CONSTRAINT DF_app_user_client_token DEFAULT (CONVERT(NVARCHAR(64), NEWID()));
GO

ALTER TABLE app_user ADD CONSTRAINT UQ_app_user_client_token UNIQUE (client_token);
GO

-- display_name is now the mandatory typed identity itself, not a display
-- convenience alongside a verified identifier -- make that explicit in schema.
ALTER TABLE app_user ALTER COLUMN display_name NVARCHAR(255) NOT NULL;
GO
