-- Adds an optional TARGIT-supplied identity alongside the existing per-browser
-- client_token (see 004_drop_entra_identity.sql). TARGIT may soon pass its own
-- logged-in username as a URL parameter via a webbox element (still to be
-- confirmed by DWH/TARGIT config) -- when present, that's a materially better
-- ownership key than client_token: it's stable across devices/browsers for
-- the same person, unlike the random per-browser token. When it's not
-- present (manual typing, current default), app_user is still resolved by
-- client_token exactly as before -- deliberately NOT by the typed display
-- name, since two people could type the same name and that would let one
-- delete the other's comments.
--
-- Nullable + unique: SQL Server allows multiple NULLs under a unique
-- constraint, so rows with no TARGIT identity are unaffected.

ALTER TABLE app_user ADD targit_username NVARCHAR(255) NULL;
GO

ALTER TABLE app_user ADD CONSTRAINT UQ_app_user_targit_username UNIQUE (targit_username);
GO
