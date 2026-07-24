/**
 * FR1 (context intake): the TARGIT launch link carries IDs only — no readable
 * business names (10/07/2026 decision, re-tightened 21/07/2026). Display data
 * for the product is resolved server-side from DWH's master view instead of
 * being trusted from the query string. Period/month is not carried at all
 * (deferred from v1 — TARGIT can't inject it, periods are report columns).
 */
/**
 * TARGIT sends the clicked cell's date member as YYYYMMDD (e.g. "20250801").
 * We key comments on YEAR+MONTH only: the report aggregates monthly, so every
 * day inside a month must resolve to the same comment thread no matter which
 * day the cube hands us. Returns null for anything that isn't a usable date,
 * so callers treat "no month selected" and "garbage in the URL" the same way.
 */
export function normalizePeriodId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const build = (year: number, month: number): string | null =>
    month >= 1 && month <= 12 && year >= 1900 && year <= 2200
      ? `${year}${String(month).padStart(2, '0')}`
      : null;

  // Separated forms (2025-08-01, 01/08/2025, 2025.08). Whether the year comes
  // first or last, the MONTH is the middle part in both dd/mm/yyyy and
  // yyyy/mm/dd -- so locate the 4-digit year and read the month next to it,
  // instead of assuming one locale's ordering.
  const parts = value.split(/[^0-9]+/).filter(Boolean);
  if (parts.length >= 2) {
    // A range ("20250801-20250831", i.e. the whole month) or any list whose
    // first element is already a complete date: the period is the first one.
    if (parts[0].length === 6 || parts[0].length === 8) return normalizePeriodId(parts[0]);
    if (parts[0].length === 4) return build(Number(parts[0]), Number(parts[1]));
    if (parts[parts.length - 1].length === 4) {
      return build(Number(parts[parts.length - 1]), Number(parts[parts.length - 2]));
    }
    return null;
  }

  // Unseparated digits: 20250801 (YYYYMMDD), 202508 (YYYYMM), 01082025 (DDMMYYYY).
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length === 6) return build(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)));
  if (digits.length === 8) {
    const leadingYear = build(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)));
    if (leadingYear) return leadingYear;
    return build(Number(digits.slice(4, 8)), Number(digits.slice(2, 4)));
  }
  return null;
}

export interface ReportContext {
  /** Numeric, opaque report code (db/migrations/007_numeric_report_id.sql) -- never a
   *  descriptive name, so the TARGIT URL never exposes a readable report identity. */
  reportId: number;
  productId: string;
  /** Normalized YYYYMM. Required: a comment always belongs to one month. */
  periodId: string;
  /**
   * Human-readable report name, chosen by us alongside reportId when we
   * author each report's TARGIT webbox URL. Optional -- only used to give
   * resolveReport() a nice name on first-time auto-create of a dim_report
   * row (see data-api/src/queries/comments.ts). Never trusted for anything
   * besides that seed value; display data still resolves server-side.
   */
  reportName?: string;
}

export class ContextValidationError extends Error {}

export function parseContext(params: URLSearchParams | Record<string, string | null | undefined>): ReportContext {
  const get = (key: string): string | undefined => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return value ?? undefined;
  };

  const reportIdRaw = get('reportId');
  const productId = get('productId');
  const reportName = get('reportName');
  const periodId = normalizePeriodId(get('date'));

  if (!reportIdRaw) throw new ContextValidationError('Falta el parámetro obligatorio: reportId');
  if (!/^\d+$/.test(reportIdRaw)) throw new ContextValidationError('reportId debe ser numérico');
  if (!productId) throw new ContextValidationError('Falta el parámetro obligatorio: productId');
  if (!periodId) throw new ContextValidationError('Falta el parámetro obligatorio: date (mes seleccionado)');

  return { reportId: Number(reportIdRaw), productId, periodId, reportName };
}
