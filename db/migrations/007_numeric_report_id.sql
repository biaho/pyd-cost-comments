-- Decouples the URL-facing report identifier from the internal report_key
-- surrogate PK, and switches it from a descriptive slug ("coste-interno") to
-- an opaque numeric code, so TARGIT webbox URLs never carry a readable
-- report name and a future table rebuild/restore can never silently
-- renumber an already-published TARGIT link (report_key stays IDENTITY,
-- untouched by this migration; every comment_entry FK survives as-is).
--
-- New registration workflow (DWH-maintained, agreed 24/07/2026): the DWH
-- team inserts a new dim_report row themselves before wiring a report's
-- TARGIT webbox URL --
--   INSERT INTO dim_report (report_name) OUTPUT INSERTED.report_id
--   VALUES (N'Nuevo Informe');
-- -- report_id auto-populates from its own SEQUENCE (decoupled from
-- report_key's IDENTITY on purpose -- SQL Server allows only one IDENTITY
-- column per table, and these two counters must be free to diverge). The
-- returned report_id is what gets pasted into that report's TARGIT URL.
-- resolveReport() no longer auto-creates on an unrecognized reportId (see
-- data-api/src/queries/comments.ts) -- an unregistered id now fails loudly
-- instead of silently polluting the table.

-- 1. Independent counter for report_id.
CREATE SEQUENCE dbo.seq_dim_report_id
    AS INT
    START WITH 1001
    INCREMENT BY 1;
GO

-- 2. Renumber existing rows before changing the column type (INT can't hold
--    "coste-interno"/"coste-medio"). report_key is untouched, so the 14
--    existing comment_entry rows against report_key=1 stay valid.
ALTER TABLE dim_report DROP CONSTRAINT UQ_dim_report_report_id;
GO

UPDATE dim_report
SET report_id = CAST(NEXT VALUE FOR dbo.seq_dim_report_id AS NVARCHAR(50));
GO

ALTER TABLE dim_report ALTER COLUMN report_id INT NOT NULL;
GO

ALTER TABLE dim_report ADD CONSTRAINT DF_dim_report_report_id
    DEFAULT (NEXT VALUE FOR dbo.seq_dim_report_id) FOR report_id;
GO

ALTER TABLE dim_report ADD CONSTRAINT UQ_dim_report_report_id UNIQUE (report_id);
GO

-- 3. Monitoring snapshot of TARGIT's own live report title ({$Title}),
--    kept separate from report_name (our stable internal label, set once at
--    registration). A TARGIT-side rename becomes visible here for us to
--    notice, without ever silently changing what we call the report.
ALTER TABLE dim_report ADD targit_title_last_seen NVARCHAR(200) NULL;
GO
ALTER TABLE dim_report ADD targit_title_last_seen_at_utc DATETIME2 NULL;
GO
