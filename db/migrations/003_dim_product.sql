-- ============================================================
-- SUPERSEDED 21/07/2026 — DO NOT RUN.
-- Dev team decision: we do not own/maintain product master data.
-- DWH is exposing it as a self-maintained VIEW in their own read-only
-- database (AICatalyst) instead, kept current by their own ETL against
-- the source table. Our app queries that view directly (cross-database
-- read) rather than loading/owning a local copy.
-- Kept here for history only. Full rationale: logs/decisions.log.md,
-- 21/07/2026 "dim_product reversed" entry.
-- ============================================================

-- dim_product — master product reference table for pyd-cost-comments
-- Source: MS-provided master product Excel export (product master data,
-- key column "Número Producto"). Loaded via a one-off/periodic bulk load
-- script (to be written, mirrors 001/002's run-migration.ts pattern), not
-- live ETL for now -- same manual-refresh cadence as dim_report.
--
-- Purpose: lets the TARGIT launch URL carry only reportId + productId (no
-- readable names/brand/fragrance in the URL, per the original 10/07/2026
-- URL-contract decision) -- all display data is resolved from this table
-- server-side instead of trusted from the URL.
--
-- Column naming: Spanish/accented spreadsheet headers mapped to plain
-- ASCII snake_case, matching the rest of this schema.
--
-- ASSUMPTIONS TO CONFIRM WITH MS before running against any DB:
--   - is_discontinued: assumed a real boolean flag in the source data
--     (e.g. Y/N, 1/0, blank/X). If the source is something else (a status
--     code, a discontinuation date), this column/type needs to change.
--   - launch_date: assumed a real date in the source export. If it's
--     free-text or a different granularity (year/month only), change to
--     NVARCHAR or adjust precision.
--   - spx_description_06/07/08/09: kept as generic, numbered columns
--     since their business meaning isn't known yet. Rename once MS
--     clarifies what "spx description NN" actually represents.
--
-- Intentionally NOT a hard FK target from comment_entry.product_id --
-- kept as a loose lookup (find via /product/resolve, matching the
-- existing find-or-create pattern used by /report/resolve and
-- /user/resolve) so a comment can still be saved even if the product
-- master hasn't been refreshed yet with a brand-new product_id.

CREATE TABLE dim_product (
    product_key          BIGINT IDENTITY(1,1) NOT NULL,
    product_id            NVARCHAR(100)  NOT NULL,   -- "Número Producto"
    description            NVARCHAR(300)  NOT NULL,   -- "Descripción Producto"
    description_2           NVARCHAR(300)  NULL,       -- "Producto product_desc_2"
    ean_code               NVARCHAR(50)   NULL,       -- "Producto Código EAN Producto"
    is_discontinued         BIT            NOT NULL CONSTRAINT DF_dim_product_is_discontinued DEFAULT (0), -- "Producto Descatalogado"
    family                 NVARCHAR(150)  NULL,       -- "Producto Familia"
    fragrance              NVARCHAR(150)  NULL,       -- "Producto Fragancia"
    olfactory_family        NVARCHAR(150)  NULL,       -- "Producto Familia Olfativa"
    brand                   NVARCHAR(150)  NULL,       -- "Producto Marca"
    spx_description_06      NVARCHAR(300)  NULL,       -- "Producto spx description 06"
    spx_description_07      NVARCHAR(300)  NULL,       -- "Producto spx description 07"
    spx_description_08      NVARCHAR(300)  NULL,       -- "Producto spx description 08"
    subfamily               NVARCHAR(150)  NULL,       -- "Producto Subfamilia"
    spx_description_09      NVARCHAR(300)  NULL,       -- "Producto spx description 09"
    size                    NVARCHAR(100)  NULL,       -- "Producto Tamaño"
    launch_date              DATE           NULL,       -- "Producto Lanzamiento"
    created_at_utc          DATETIME2      NOT NULL CONSTRAINT DF_dim_product_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at_utc          DATETIME2      NOT NULL CONSTRAINT DF_dim_product_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_dim_product PRIMARY KEY CLUSTERED (product_key),
    CONSTRAINT UQ_dim_product_product_id UNIQUE (product_id)
);
GO
