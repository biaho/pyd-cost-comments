import type { ConnectionPool } from 'mssql';

export interface ProductInfo {
  productId: string;
  productName: string | null;
  brand: string | null;
  fragrance: string | null;
}

/**
 * Cross-database read against DWH's self-maintained product master view. Read-only
 * and not a find-or-create (unlike resolveReport/resolveUser) — we own nothing here,
 * DWH's own ETL keeps it current.
 *
 * Column mapping confirmed with MS 21/07/2026: class_description is the fragrance
 * and spx_description_01 is the brand as the user sees them in TARGIT — despite
 * brand_description existing, which is a different DWH-internal field.
 *
 * product_number is NOT unique: the view is a Type-2 slowly-changing dimension, so
 * a product has one row per historical version (dss_version / dss_start_date /
 * dss_end_date / dss_current_flag). MS checked 21/07/2026 that the four columns we
 * read currently agree across a product's versions — but that's a property of
 * today's data, not a guarantee, and TOP (1) without ORDER BY is non-deterministic
 * regardless. The ordering below pins the pick to the current version.
 *
 * dss_current_flag DESC sorts correctly whether the flag is BIT (1 > 0) or CHAR
 * ('Y' > 'N'), so this is safe without depending on which convention DWH used.
 */
export async function resolveProduct(
  pool: ConnectionPool,
  productDbName: string,
  productId: string
): Promise<ProductInfo | null> {
  // A database name can't be a bound parameter, so it's interpolated — constrained
  // to plain identifier characters so a malformed env value can't break out of the
  // brackets.
  if (!/^[A-Za-z0-9_]+$/.test(productDbName)) {
    throw new Error(`Invalid PRODUCT_DB_NAME: ${productDbName}`);
  }

  const result = await pool
    .request()
    .input('productId', productId)
    .query(
      `SELECT TOP (1) product_number, product_desc, class_description, spx_description_01
       FROM [${productDbName}].[dbo].[view_dim_product]
       WHERE product_number = @productId
       ORDER BY dss_current_flag DESC, dss_version DESC, dss_start_date DESC`
    );

  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];
  return {
    productId: String(row.product_number ?? productId).trim(),
    productName: row.product_desc?.trim() ?? null,
    brand: row.spx_description_01?.trim() ?? null,
    fragrance: row.class_description?.trim() ?? null,
  };
}
