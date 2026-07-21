/**
 * FR1 (context intake): the TARGIT launch link carries IDs only — no readable
 * business names (10/07/2026 decision, re-tightened 21/07/2026). Display data
 * for the product is resolved server-side from DWH's master view instead of
 * being trusted from the query string. Period/month is not carried at all
 * (deferred from v1 — TARGIT can't inject it, periods are report columns).
 */
export interface ReportContext {
  reportId: string;
  productId: string;
}

export class ContextValidationError extends Error {}

export function parseContext(params: URLSearchParams | Record<string, string | null | undefined>): ReportContext {
  const get = (key: string): string | undefined => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return value ?? undefined;
  };

  const reportId = get('reportId');
  const productId = get('productId');

  if (!reportId) throw new ContextValidationError('Falta el parámetro obligatorio: reportId');
  if (!productId) throw new ContextValidationError('Falta el parámetro obligatorio: productId');

  return { reportId, productId };
}
