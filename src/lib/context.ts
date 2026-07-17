/**
 * FR1 (context intake): parses and validates the minimum URL parameters the
 * vendor report (TARGIT) launch link is expected to carry. Field names/shape
 * are provisional -- TARGIT's actual integration format isn't confirmed yet
 * (see _INDEX.md next actions), simulated here with placeholders in the
 * meantime.
 */
export interface ReportContext {
  reportId: string;
  reportName?: string;
  productId: string;
  productName?: string;
  brand?: string;
  fragrance?: string;
  periodLabel?: string;
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

  return {
    reportId,
    reportName: get('reportName'),
    productId,
    productName: get('productName'),
    brand: get('brand'),
    fragrance: get('fragrance'),
    periodLabel: get('periodLabel'),
  };
}
