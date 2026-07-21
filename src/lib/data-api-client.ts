import type { Identity } from './auth';

/**
 * Client for the on-prem Data API (see ../../data-api/). The actual SQL
 * connection lives on an always-on machine inside PYD's domain, reached
 * here over HTTPS via Tailscale Funnel -- keeps SQL Server's raw TDS
 * surface off the internet and gives a controlled, parameterized-query
 * boundary instead. Full rationale in ../../logs/decisions.log.md
 * (17/07/2026, "Phase B bridge tech decided").
 */

export interface CommentRow {
  commentEntryKey: number;
  commentText: string;
  createdAtUtc: string;
  authorDisplayName: string | null;
  authorUserPrincipalName: string | null;
  appUserKey: number;
}

export interface ProductInfo {
  productId: string;
  productName: string | null;
  brand: string | null;
  fragrance: string | null;
}

export interface SaveCommentParams {
  reportKey: number;
  productId: string;
  productName?: string;
  brand?: string;
  fragrance?: string;
  periodLabel?: string;
  appUserKey: number;
  commentText: string;
}

export interface TranscriptionUsageParams {
  appUserKey: number;
  callType?: string;
  characters: number;
  durationSecondsEst?: number;
  costUsd: number;
  model: string;
}

export interface UsageLogRow {
  id: number;
  userId: number;
  displayName: string | null;
  userPrincipalName: string | null;
  callType: string;
  apiProvider: string | null;
  characters: number | null;
  durationSeconds: number | null;
  costUsd: number | null;
  model: string | null;
  createdAt: string;
}

async function callDataApi<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.DATA_API_URL;
  const apiKey = process.env.DATA_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('Missing DATA_API_URL / DATA_API_KEY env vars.');
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Data API ${path} failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function resolveReport(reportId: string, reportName?: string): Promise<number> {
  const { reportKey } = await callDataApi<{ reportKey: number }>('/report/resolve', {
    method: 'POST',
    body: JSON.stringify({ reportId, reportName }),
  });
  return reportKey;
}

/**
 * Display data for the product the TARGIT link points at. The launch URL carries
 * only IDs, so brand/fragrance/name are resolved here from DWH's master view
 * rather than trusted from the query string. Null when the product isn't in the
 * master — a comment can still be saved against it (loose lookup, not a hard FK).
 */
export async function resolveProduct(productId: string): Promise<ProductInfo | null> {
  const params = new URLSearchParams({ productId });
  const { product } = await callDataApi<{ product: ProductInfo | null }>(`/product/resolve?${params}`);
  return product;
}

export async function resolveUser(identity: Identity): Promise<number> {
  const { appUserKey } = await callDataApi<{ appUserKey: number }>('/user/resolve', {
    method: 'POST',
    body: JSON.stringify(identity),
  });
  return appUserKey;
}

export async function loadComments(reportKey: number, productId: string): Promise<CommentRow[]> {
  const params = new URLSearchParams({ reportKey: String(reportKey), productId });
  const { comments } = await callDataApi<{ comments: CommentRow[] }>(`/comments?${params}`);
  return comments;
}

export async function saveComment(params: SaveCommentParams): Promise<number> {
  const { commentEntryKey } = await callDataApi<{ commentEntryKey: number }>('/comments', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return commentEntryKey;
}

export async function softDeleteComment(commentEntryKey: number, requestingUserKey: number): Promise<boolean> {
  const { deleted } = await callDataApi<{ deleted: boolean }>('/comments/soft-delete', {
    method: 'POST',
    body: JSON.stringify({ commentEntryKey, requestingUserKey }),
  });
  return deleted;
}

export async function logTranscriptionUsage(params: TranscriptionUsageParams): Promise<void> {
  await callDataApi<{ ok: true }>('/usage-log', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function loadUsageLog(range?: { start?: Date; end?: Date }): Promise<UsageLogRow[]> {
  const params = new URLSearchParams();
  if (range?.start) params.set('start', range.start.toISOString());
  if (range?.end) params.set('end', range.end.toISOString());
  const qs = params.toString();
  const { rows } = await callDataApi<{ rows: UsageLogRow[] }>(`/usage-log${qs ? `?${qs}` : ''}`);
  return rows;
}
