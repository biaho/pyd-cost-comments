-- Least privilege for pyd-cost-comments (24/09/2026 audit: the Data API ran as AICatalyst, db_owner on all
-- three P26 databases). The rights below are exactly what data-api/src/queries uses on its 4 tables (per
-- table below; no DELETE anywhere, soft delete is an UPDATE), plus reading the product view.
--
-- Step 1 — MS as sa (server level, and P21Warehouse, where AICatalyst has no rights):
--   CREATE LOGIN costcomments_app WITH PASSWORD = N'<chosen by MS>', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF,
--          DEFAULT_DATABASE = P26AICatalyst_Work;
--   USE P21Warehouse;  -- view_dim_product reads P21Warehouse.dbo.dim_product (cross-DB chaining is off)
--   CREATE USER costcomments_app FOR LOGIN costcomments_app;
--   GRANT SELECT ON dbo.dim_product TO costcomments_app;
--
-- Step 2 — as AICatalyst (db_owner), the two batches below. Idempotent.
-- Step 3 — production switch (planned window): data-api\.env DB_USER/DB_PASSWORD → costcomments_app,
--   restart-onprem.cmd, check health. Rollback = restore the previous .env values and restart.

USE P26AICatalyst_Work;
IF DATABASE_PRINCIPAL_ID(N'costcomments_app') IS NULL CREATE USER costcomments_app FOR LOGIN costcomments_app WITH DEFAULT_SCHEMA = dbo;
GRANT SELECT, UPDATE ON dbo.dim_report TO costcomments_app;             -- resolve + title snapshot (DWH inserts rows)
GRANT SELECT, INSERT, UPDATE ON dbo.app_user TO costcomments_app;
GRANT SELECT, INSERT, UPDATE ON dbo.comment_entry TO costcomments_app;  -- soft delete = UPDATE
GRANT SELECT, INSERT ON dbo.transcription_usage_log TO costcomments_app;
GO

USE P26AICatalyst;
IF DATABASE_PRINCIPAL_ID(N'costcomments_app') IS NULL CREATE USER costcomments_app FOR LOGIN costcomments_app;
GRANT SELECT ON dbo.view_dim_product TO costcomments_app;
GO
