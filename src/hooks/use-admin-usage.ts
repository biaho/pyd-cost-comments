import { useCallback, useEffect, useMemo, useState } from "react";

export type RangeKey = "7d" | "30d" | "90d" | "all" | "custom";

export interface UsageRow {
  id: number;
  userId: number;
  displayName: string | null;
  callType: string;
  apiProvider: string | null;
  characters: number | null;
  durationSeconds: number | null;
  costUsd: number | null;
  model: string | null;
  createdAt: string;
}

export interface Filters {
  range: RangeKey;
  customStart?: string;
  customEnd?: string;
  userIds: string[];
  providers: string[];
  callTypes: string[];
  day: string | null;
}

export interface DailyPoint {
  date: string;
  calls: number;
  cost: number;
  characters: number;
  byProvider: Record<string, number>;
}

export interface GroupAgg {
  key: string;
  calls: number;
  characters: number;
  cost: number;
}

export interface UserAgg extends GroupAgg {
  username: string;
  lastActivity: string;
}

const DAY_MS = 86_400_000;

function rangeBounds(f: Filters): { start: Date | null; end: Date | null } {
  if (f.range === "all") return { start: null, end: null };
  if (f.range === "custom") {
    return {
      start: f.customStart ? new Date(f.customStart) : null,
      end: f.customEnd ? new Date(new Date(f.customEnd).getTime() + DAY_MS - 1) : null,
    };
  }
  const days = f.range === "7d" ? 7 : f.range === "30d" ? 30 : 90;
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function usernameFromRow(r: UsageRow): string {
  return r.displayName || `user-${r.userId}`;
}

export function useAdminUsage(filters: Filters, adminKey: string) {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = rangeBounds(filters);
      const params = new URLSearchParams();
      if (start) params.set("start", start.toISOString());
      if (end) params.set("end", end.toISOString());
      params.set("key", adminKey);

      const res = await fetch(`/api/admin/usage-log?${params.toString()}`);
      const body = await res.json();

      if (res.status === 403) {
        setForbidden(true);
        setRows([]);
        return;
      }
      setForbidden(false);

      if (!res.ok) throw new Error(body.error ?? "Error al cargar el uso de la API.");
      setRows(body.rows as UsageRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters.range, filters.customStart, filters.customEnd, adminKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.userIds.length && !filters.userIds.includes(String(r.userId))) return false;
      if (filters.providers.length && !filters.providers.includes(r.apiProvider || "unknown")) return false;
      if (filters.callTypes.length && !filters.callTypes.includes(r.callType)) return false;
      if (filters.day && toDateKey(r.createdAt) !== filters.day) return false;
      return true;
    });
  }, [rows, filters.userIds, filters.providers, filters.callTypes, filters.day]);

  const kpis = useMemo(() => {
    const users = new Set<number>();
    let calls = 0,
      chars = 0,
      cost = 0;
    for (const r of filtered) {
      calls += 1;
      chars += r.characters || 0;
      cost += Number(r.costUsd) || 0;
      users.add(r.userId);
    }
    return {
      calls,
      characters: chars,
      cost,
      users: users.size,
      avgCostPerUser: users.size ? cost / users.size : 0,
    };
  }, [filtered]);

  const daily: DailyPoint[] = useMemo(() => {
    const map = new Map<string, DailyPoint>();
    for (const r of filtered) {
      const k = toDateKey(r.createdAt);
      const provider = r.apiProvider || "unknown";
      const ex = map.get(k) || { date: k, calls: 0, cost: 0, characters: 0, byProvider: {} };
      ex.calls += 1;
      ex.cost += Number(r.costUsd) || 0;
      ex.characters += r.characters || 0;
      ex.byProvider[provider] = (ex.byProvider[provider] || 0) + (Number(r.costUsd) || 0);
      map.set(k, ex);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const byProvider = useMemo(() => groupBy(filtered, (r) => r.apiProvider || "unknown"), [filtered]);
  const byCallType = useMemo(() => groupBy(filtered, (r) => r.callType), [filtered]);

  const byUser: UserAgg[] = useMemo(() => {
    const map = new Map<string, UserAgg>();
    for (const r of filtered) {
      const key = String(r.userId);
      const username = usernameFromRow(r);
      const ex = map.get(key) || {
        key,
        username,
        calls: 0,
        characters: 0,
        cost: 0,
        lastActivity: r.createdAt,
      };
      ex.calls += 1;
      ex.characters += r.characters || 0;
      ex.cost += Number(r.costUsd) || 0;
      if (r.createdAt > ex.lastActivity) ex.lastActivity = r.createdAt;
      map.set(key, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [filtered]);

  const detailByDay = useMemo(() => {
    const map = new Map<string, UsageRow[]>();
    for (const r of filtered) {
      const k = toDateKey(r.createdAt);
      const arr = map.get(k) || [];
      arr.push(r);
      map.set(k, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const usernameFor = useCallback(
    (userId: string) => {
      const row = rows.find((r) => String(r.userId) === userId);
      return row ? usernameFromRow(row) : `user-${userId}`;
    },
    [rows]
  );

  const allUsers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(String(r.userId), usernameFromRow(r));
    return Array.from(map.entries())
      .map(([id, username]) => ({ id, username }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [rows]);

  const allProviders = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.apiProvider || "unknown");
    return Array.from(s).sort();
  }, [rows]);

  const allCallTypes = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.callType);
    return Array.from(s).sort();
  }, [rows]);

  return {
    loading,
    error,
    forbidden,
    rows: filtered,
    kpis,
    daily,
    byProvider,
    byCallType,
    byUser,
    detailByDay,
    usernameFor,
    allUsers,
    allProviders,
    allCallTypes,
    refetch: fetchData,
  };
}

function groupBy(rows: UsageRow[], keyFn: (r: UsageRow) => string): GroupAgg[] {
  const map = new Map<string, GroupAgg>();
  for (const r of rows) {
    const k = keyFn(r);
    const ex = map.get(k) || { key: k, calls: 0, characters: 0, cost: 0 };
    ex.calls += 1;
    ex.characters += r.characters || 0;
    ex.cost += Number(r.costUsd) || 0;
    map.set(k, ex);
  }
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}
