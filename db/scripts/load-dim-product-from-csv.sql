-- ============================================================
-- SUPERSEDED 21/07/2026 — DO NOT RUN.
-- See db/migrations/003_dim_product.sql — product master data is now a
-- DWH-owned, self-maintained view in their own database, not a local
-- table we load. Kept here for history only.
-- ============================================================

-- One-time load of dim_product from the MS-provided master product CSV export.
-- Run AFTER db/migrations/003_dim_product.sql has created the empty dim_product table.
--
-- Loads into a staging table first (all columns as raw NVARCHAR, matching the
-- CSV exactly) so BULK INSERT never fails on a type mismatch, then transforms
-- into dim_product with proper types (is_discontinued text -> BIT,
-- launch_date text -> DATE, tolerant of blanks/unknown formats).
--
-- Prep the CSV before running this:
--   1. In Excel, format the "Código EAN Producto" column as TEXT (not Number/
--      General) BEFORE exporting -- otherwise long EAN codes get mangled into
--      scientific notation (e.g. 8.43175E+12) and lose precision.
--   2. Save As -> CSV UTF-8 (Comma delimited) (*.csv). Keep the header row.
--   3. Copy the CSV onto the server the same way as before (RDP clipboard).
--
-- Adjust @CsvPath below to wherever the CSV actually landed on the server.

DECLARE @CsvPath NVARCHAR(500) = 'C:\Services\dim_product_load\master_product.csv';

-- ============================================================
-- 1. Staging table -- raw text, one column per CSV column, same order
-- ============================================================
IF OBJECT_ID('stg_dim_product_load', 'U') IS NOT NULL
    DROP TABLE stg_dim_product_load;

CREATE TABLE stg_dim_product_load (
    product_id            NVARCHAR(100)  NULL,
    description             NVARCHAR(300)  NULL,
    description_2            NVARCHAR(300)  NULL,
    ean_code                NVARCHAR(50)   NULL,
    is_discontinued_raw       NVARCHAR(20)   NULL,
    family                  NVARCHAR(150)  NULL,
    fragrance               NVARCHAR(150)  NULL,
    olfactory_family         NVARCHAR(150)  NULL,
    brand                    NVARCHAR(150)  NULL,
    spx_description_06       NVARCHAR(300)  NULL,
    spx_description_07       NVARCHAR(300)  NULL,
    spx_description_08       NVARCHAR(300)  NULL,
    subfamily                NVARCHAR(150)  NULL,
    spx_description_09       NVARCHAR(300)  NULL,
    size                     NVARCHAR(100)  NULL,
    launch_date_raw           NVARCHAR(50)   NULL
);
GO

-- ============================================================
-- 2. Bulk load the CSV into staging (run this block separately if @CsvPath
--    needs to stay a literal -- BULK INSERT doesn't accept a variable path
--    directly on all SQL Server versions; if it errors, replace @CsvPath's
--    use below with the literal path in quotes)
-- ============================================================
BULK INSERT stg_dim_product_load
FROM 'C:\Services\dim_product_load\master_product.csv'   -- <-- edit this path
WITH (
    FORMAT = 'CSV',
    FIRSTROW = 2,              -- skip header row
    FIELDTERMINATOR = ',',
    CODEPAGE = '65001',        -- UTF-8, preserves accented characters
    TABLOCK
);
GO

-- Sanity check before transforming
SELECT COUNT(*) AS staged_row_count FROM stg_dim_product_load;
GO

-- ============================================================
-- 3. Transform + upsert into dim_product
-- ============================================================
MERGE dim_product AS target
USING (
    SELECT
        product_id,
        description,
        description_2,
        ean_code,
        CASE
            WHEN UPPER(LTRIM(RTRIM(is_discontinued_raw))) IN (N'SI', N'SÍ', N'YES', N'S', N'1')
                THEN CAST(1 AS BIT)
            ELSE CAST(0 AS BIT)
        END AS is_discontinued,
        family,
        fragrance,
        olfactory_family,
        brand,
        spx_description_06,
        spx_description_07,
        spx_description_08,
        subfamily,
        spx_description_09,
        size,
        COALESCE(
            TRY_CONVERT(DATE, launch_date_raw, 103),  -- dd/mm/yyyy (Spanish format)
            TRY_CONVERT(DATE, launch_date_raw, 120)   -- yyyy-mm-dd (ISO fallback)
        ) AS launch_date
    FROM stg_dim_product_load
    WHERE product_id IS NOT NULL AND LTRIM(RTRIM(product_id)) <> ''
) AS source
ON target.product_id = source.product_id
WHEN MATCHED THEN
    UPDATE SET
        description = source.description,
        description_2 = source.description_2,
        ean_code = source.ean_code,
        is_discontinued = source.is_discontinued,
        family = source.family,
        fragrance = source.fragrance,
        olfactory_family = source.olfactory_family,
        brand = source.brand,
        spx_description_06 = source.spx_description_06,
        spx_description_07 = source.spx_description_07,
        spx_description_08 = source.spx_description_08,
        subfamily = source.subfamily,
        spx_description_09 = source.spx_description_09,
        size = source.size,
        launch_date = source.launch_date,
        updated_at_utc = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (product_id, description, description_2, ean_code, is_discontinued,
            family, fragrance, olfactory_family, brand,
            spx_description_06, spx_description_07, spx_description_08,
            subfamily, spx_description_09, size, launch_date)
    VALUES (source.product_id, source.description, source.description_2, source.ean_code,
            source.is_discontinued, source.family, source.fragrance, source.olfactory_family,
            source.brand, source.spx_description_06, source.spx_description_07,
            source.spx_description_08, source.subfamily, source.spx_description_09,
            source.size, source.launch_date);
GO

-- ============================================================
-- 4. Verify
-- ============================================================
SELECT COUNT(*) AS dim_product_row_count FROM dim_product;
SELECT TOP 10 * FROM dim_product ORDER BY product_key DESC;
-- Spot-check is_discontinued conversion and launch_date parsing look right, then:

-- 5. Cleanup (optional, once verified -- staging table has no ongoing purpose)
-- DROP TABLE stg_dim_product_load;
