-- Phase 1 MVP schema for pyd-cost-comments
-- Source of truth: 02_AI_Agent/clients/PYD/pyd-cost-comments/prompts/schema-blueprint.md
-- Append-only comment history (soft-delete only), Entra-authenticated users,
-- controlled report list.
--
-- TEST/DEV RUN target: P26AICatalyst (access confirmed 17/07/2026).
-- PRODUCTION target: P26AICatalyst_Work (access pending) — re-run this same
-- migration there once access lands. Do not run against either DB without
-- explicit sign-off.
--
-- Deviations from schema-blueprint.md, agreed with MS 17/07/2026:
--   - dim_report kept as originally specified -- a real master table scales
--     better than a hardcoded app-side mapping if more reports get added
--     later, and centralizes is_active/report_name.
--   - app_user.email dropped (data minimization). It duplicated
--     user_principal_name in a single-tenant setup; FR3 in the blueprint
--     already marks author email/username as optional, so
--     user_principal_name alone satisfies it without storing the same
--     personal identifier twice.
--   - app_user.oidc_subject dropped. entra_object_id (the Entra `oid` claim)
--     is already the stable, tenant-wide unique identifier for this exact
--     purpose when using Entra ID + MSAL; the separate OIDC `sub` claim is
--     pairwise/app-scoped and adds nothing here.
--   - app_user.tenant_id dropped. The App Registration is single-tenant, so
--     this value is identical on every row -- a constant belongs in app
--     config (env var), not repeated per-row in the DB.
--   - comment_entry soft-delete fields (is_deleted/deleted_at_utc/
--     deleted_by_user_key) reinstated. Initially dropped because no Phase 1
--     FR requires delete/edit (blueprint defers that to Phase 2) -- but
--     reconsidered same session: without it, a user who mistypes a comment
--     has zero recourse, even to hide their own mistake from the shared
--     view. Deliberate small pull-forward from Phase 2, not a blueprint
--     compliance gap.

-- ============================================================
-- 1. dim_report — controlled list of the source reports
-- ============================================================
CREATE TABLE dim_report (
    report_key      BIGINT IDENTITY(1,1) NOT NULL,
    report_id       NVARCHAR(50)   NOT NULL,
    report_name     NVARCHAR(200)  NOT NULL,
    is_active       BIT            NOT NULL CONSTRAINT DF_dim_report_is_active DEFAULT (1),
    created_at_utc  DATETIME2      NOT NULL CONSTRAINT DF_dim_report_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at_utc  DATETIME2      NOT NULL CONSTRAINT DF_dim_report_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_dim_report PRIMARY KEY CLUSTERED (report_key),
    CONSTRAINT UQ_dim_report_report_id UNIQUE (report_id)
);
GO

-- ============================================================
-- 2. app_user — application-level user registry from Entra ID
-- ============================================================
CREATE TABLE app_user (
    app_user_key         BIGINT IDENTITY(1,1) NOT NULL,
    entra_object_id      NVARCHAR(100)  NOT NULL,
    user_principal_name  NVARCHAR(255)  NULL,
    display_name         NVARCHAR(255)  NULL,
    is_active            BIT            NOT NULL CONSTRAINT DF_app_user_is_active DEFAULT (1),
    first_login_at_utc   DATETIME2      NOT NULL CONSTRAINT DF_app_user_first_login DEFAULT (SYSUTCDATETIME()),
    last_login_at_utc    DATETIME2      NOT NULL CONSTRAINT DF_app_user_last_login DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_app_user PRIMARY KEY CLUSTERED (app_user_key),
    CONSTRAINT UQ_app_user_entra_object_id UNIQUE (entra_object_id)
);
GO

-- ============================================================
-- 3. comment_entry — append-only comment history (soft-delete only)
-- ============================================================
CREATE TABLE comment_entry (
    comment_entry_key      BIGINT IDENTITY(1,1) NOT NULL,
    report_key             BIGINT          NOT NULL,
    product_id             NVARCHAR(100)   NOT NULL,
    product_name_snapshot  NVARCHAR(300)   NULL,
    brand_snapshot         NVARCHAR(200)   NULL,
    fragrance_snapshot     NVARCHAR(200)   NULL,
    period_label_snapshot  NVARCHAR(200)   NULL,
    app_user_key           BIGINT          NOT NULL,
    comment_text           NVARCHAR(MAX)   NOT NULL,
    created_at_utc         DATETIME2       NOT NULL CONSTRAINT DF_comment_entry_created_at DEFAULT (SYSUTCDATETIME()),
    is_deleted             BIT             NOT NULL CONSTRAINT DF_comment_entry_is_deleted DEFAULT (0),
    deleted_at_utc         DATETIME2       NULL,
    deleted_by_user_key    BIGINT          NULL,
    CONSTRAINT PK_comment_entry PRIMARY KEY CLUSTERED (comment_entry_key),
    CONSTRAINT FK_comment_entry_report FOREIGN KEY (report_key) REFERENCES dim_report (report_key),
    CONSTRAINT FK_comment_entry_user FOREIGN KEY (app_user_key) REFERENCES app_user (app_user_key),
    CONSTRAINT FK_comment_entry_deleted_by FOREIGN KEY (deleted_by_user_key) REFERENCES app_user (app_user_key)
);
GO

-- ============================================================
-- Indexes
-- ============================================================

-- Primary read path: comment history for a report/product selection, newest first
CREATE INDEX IX_comment_entry_report_product_created
    ON comment_entry (report_key, product_id, created_at_utc DESC);
GO

-- Optional: comments by a given user, newest first
CREATE INDEX IX_comment_entry_user_created
    ON comment_entry (app_user_key, created_at_utc DESC);
GO

-- ============================================================
-- Seed: dim_report rows
-- No longer blocked on external codes (confirmed 22/07/2026): we author the
-- TARGIT webbox launch URL ourselves, so reportId/reportName are values we
-- choose, not codes TARGIT hands us. No manual seed needed either --
-- resolveReport() (data-api/src/queries/comments.ts) find-or-creates a row
-- the first time a given reportId/reportName pair arrives from a real
-- webbox hit. The INSERT below is only a convenience for anyone who'd
-- rather pre-seed by hand; leave commented out unless that's wanted.
-- ============================================================
-- INSERT INTO dim_report (report_id, report_name) VALUES
--     ('coste-interno', 'Coste Interno'),
--     ('coste-medio', 'Coste Medio'),
--     ('coste-medio-vs-interno', 'AI Seguimiento coste medio vs interno');
-- GO
