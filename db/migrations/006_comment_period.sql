-- Adds the period (month) to a comment's identity, 22/07/2026.
--
-- Reverses the 21/07/2026 "period deferred from v1" decision, on purpose and
-- with new information: TARGIT's webbox turned out to pass the clicked CELL's
-- date member ({FechaMiembros}, e.g. "20250801"), not just the row's product.
-- That makes a comment addressable at (report, product, month) instead of
-- (report, product) -- which is what the app is actually for: explaining a
-- cost deviation, and a deviation always happens in a period.
--
-- period_id stores the normalized YEAR+MONTH ("202508"), not the raw
-- YYYYMMDD TARGIT sends. The report aggregates monthly, so every day inside
-- a month must land in the same comment thread; normalizing on write is what
-- guarantees that regardless of which day the cube hands us.
--
-- Nullable, deliberately: the handful of rows created before this migration
-- have no period, and the app (not the schema) enforces that NEW comments
-- always carry one -- see src/lib/context.ts / data-api saveComment.
--
-- period_label_snapshot (already present, unused) stays as-is: it was always
-- a display-only field, and the label is derived from period_id at render.

ALTER TABLE comment_entry ADD period_id NVARCHAR(6) NULL;
GO

-- Primary read path is now per (report, product, month), newest first.
-- The existing IX_comment_entry_report_product_created is KEPT, not replaced:
-- it still serves "all comments for a product across every period", which is
-- exactly the shape of the per-product comment counter DWH surfaces back in
-- the TARGIT report.
CREATE INDEX IX_comment_entry_report_product_period_created
    ON comment_entry (report_key, product_id, period_id, created_at_utc DESC);
GO
