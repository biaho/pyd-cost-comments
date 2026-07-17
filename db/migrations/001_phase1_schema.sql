-- Phase 1 MVP schema for pyd-cost-comments
-- Source of truth: 02_AI_Agent/clients/PYD/pyd-cost-comments/prompts/schema-blueprint.md
-- Append-only comment history, Entra-authenticated users, minimal report lookup.
-- Do not run against the live DB without explicit sign-off (see session log).

-- ============================================================
-- 1. dim_report — controlled list of the three source reports
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
    oidc_subject         NVARCHAR(150)  NULL,
    tenant_id            NVARCHAR(100)  NOT NULL,
    user_principal_name  NVARCHAR(255)  NULL,
    email                NVARCHAR(255)  NULL,
    display_name         NVARCHAR(255)  NULL,
    is_active            BIT            NOT NULL CONSTRAINT DF_app_user_is_active DEFAULT (1),
    first_login_at_utc   DATETIME2      NOT NULL CONSTRAINT DF_app_user_first_login DEFAULT (SYSUTCDATETIME()),
    last_login_at_utc    DATETIME2      NOT NULL CONSTRAINT DF_app_user_last_login DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_app_user PRIMARY KEY CLUSTERED (app_user_key),
    CONSTRAINT UQ_app_user_entra_object_id UNIQUE (entra_object_id)
);
GO

-- ============================================================
-- 3. comment_entry — append-only comment history
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
-- Seed: dim_report placeholder rows
-- Report IDs/names not yet confirmed by client — fill in report_id/report_name
-- once TARGIT report details arrive, then uncomment and run.
-- ============================================================
-- INSERT INTO dim_report (report_id, report_name) VALUES
--     ('R1', '<report 1 name>'),
--     ('R2', '<report 2 name>'),
--     ('R3', '<report 3 name>');
-- GO
