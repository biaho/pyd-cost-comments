"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminUsage, type Filters, type RangeKey, type UsageRow } from "@/hooks/use-admin-usage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { ArrowLeft, BarChart3, Calendar, Loader2, Users, X, ChevronDown, RefreshCw, ShieldAlert } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// Dev-mode identity switcher, same mock identities as CommentView -- swap for
// real Entra ID SSO later (see src/lib/mock-auth.ts, src/lib/admin.ts).
const IDENTITY_OPTIONS = [
  { key: "aitor", label: "Aitor (admin)" },
  { key: "manuelsa", label: "Manuel Sanchez" },
  { key: "testuser2", label: "Test User 2" },
];

const CALL_TYPE_LABELS: Record<string, string> = {
  stt: "Voz a Texto",
  tts: "Texto a Voz",
};

const PROVIDER_COLORS: Record<string, string> = {
  elevenlabs: "hsl(38 92% 50%)",
  gemini: "hsl(217 91% 60%)",
  google: "hsl(142 71% 45%)",
  unknown: "hsl(0 0% 50%)",
};

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "Todo" },
  { value: "custom", label: "Custom" },
];

function parseList(s: string | null): string[] {
  return s ? s.split(",").filter(Boolean) : [];
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(4)}`;
}

export function AdminUsageView() {
  const router = useRouter();
  const params = useSearchParams();
  const [detailRow, setDetailRow] = useState<UsageRow | null>(null);
  const [asUser, setAsUser] = useState("aitor");

  const filters: Filters = useMemo(
    () => ({
      range: (params.get("range") as RangeKey) || "30d",
      customStart: params.get("from") || undefined,
      customEnd: params.get("to") || undefined,
      userIds: parseList(params.get("users")),
      providers: parseList(params.get("providers")),
      callTypes: parseList(params.get("types")),
      day: params.get("day"),
    }),
    [params]
  );

  const updateParam = (patch: Record<string, string | null | string[]>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) next.delete(k);
      else next.set(k, Array.isArray(v) ? v.join(",") : v);
    }
    router.replace(`/admin/usage?${next.toString()}`);
  };

  const toggleInList = (key: "providers" | "callTypes" | "userIds", value: string) => {
    const current = filters[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const paramKey = key === "providers" ? "providers" : key === "callTypes" ? "types" : "users";
    updateParam({ [paramKey]: next });
  };

  const usage = useAdminUsage(filters, asUser);

  if (usage.forbidden) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <ShieldAlert className="h-8 w-8 text-destructive mx-auto" />
          <h1 className="text-lg font-bold text-foreground">Acceso denegado</h1>
          <p className="text-sm text-muted-foreground">Esta página solo es accesible para administradores.</p>
          <div className="flex items-center justify-center gap-2">
            <select
              value={asUser}
              onChange={(e) => setAsUser(e.target.value)}
              className="h-9 rounded-md border border-input bg-secondary/50 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Viendo como (identidad simulada)"
            >
              {IDENTITY_OPTIONS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
            <Button onClick={() => router.push("/")} variant="outline">
              Volver
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const activeFiltersCount =
    filters.userIds.length + filters.providers.length + filters.callTypes.length + (filters.day ? 1 : 0);

  const clearAll = () => {
    updateParam({ users: null, providers: null, types: null, day: null, from: null, to: null });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight font-mono text-foreground">Uso de API</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={asUser}
              onChange={(e) => setAsUser(e.target.value)}
              className="h-8 rounded-md border border-input bg-secondary/50 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Viendo como (identidad simulada, temporal hasta decidir el mecanismo de autenticación)"
            >
              {IDENTITY_OPTIONS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon" onClick={() => usage.refetch()} disabled={usage.loading}>
              <RefreshCw className={`h-4 w-4 ${usage.loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          {/* Range */}
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={filters.range === opt.value ? "default" : "outline"}
                onClick={() => updateParam({ range: opt.value, day: null })}
                className="h-7 px-3 text-xs"
              >
                {opt.label}
              </Button>
            ))}
            {filters.range === "custom" && (
              <div className="flex items-center gap-2 ml-2">
                <Input
                  type="date"
                  value={filters.customStart || ""}
                  onChange={(e) => updateParam({ from: e.target.value })}
                  className="h-7 text-xs w-36"
                />
                <span className="text-muted-foreground text-xs">→</span>
                <Input
                  type="date"
                  value={filters.customEnd || ""}
                  onChange={(e) => updateParam({ to: e.target.value })}
                  className="h-7 text-xs w-36"
                />
              </div>
            )}
          </div>

          {/* User + provider + types */}
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Users className="h-3 w-3" />
                  Usuarios
                  {filters.userIds.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {filters.userIds.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1 max-h-72 overflow-auto">
                  {usage.allUsers.length === 0 && <p className="text-xs text-muted-foreground p-2">Sin usuarios</p>}
                  {usage.allUsers.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-secondary/50 cursor-pointer">
                      <Checkbox checked={filters.userIds.includes(u.id)} onCheckedChange={() => toggleInList("userIds", u.id)} />
                      <span className="text-xs">{u.username}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <div className="h-5 w-px bg-border" />

            {usage.allProviders.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={filters.providers.includes(p) ? "default" : "outline"}
                onClick={() => toggleInList("providers", p)}
                className="h-7 px-2 text-xs gap-1"
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: PROVIDER_COLORS[p] || PROVIDER_COLORS.unknown }} />
                {p}
              </Button>
            ))}

            <div className="h-5 w-px bg-border" />

            {usage.allCallTypes.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={filters.callTypes.includes(t) ? "default" : "outline"}
                onClick={() => toggleInList("callTypes", t)}
                className="h-7 px-2 text-xs"
              >
                {CALL_TYPE_LABELS[t] || t}
              </Button>
            ))}

            {(filters.day || activeFiltersCount > 0) && (
              <Button size="sm" variant="ghost" onClick={clearAll} className="h-7 text-xs gap-1 ml-auto">
                <X className="h-3 w-3" /> Limpiar
              </Button>
            )}
          </div>

          {filters.day && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Día seleccionado:</span>
              <Badge variant="secondary" className="gap-1">
                {format(parseISO(filters.day), "d MMM yyyy", { locale: es })}
                <button onClick={() => updateParam({ day: null })} className="hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
        </div>

        {usage.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{usage.error}</div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Llamadas" value={usage.kpis.calls.toLocaleString()} />
          <Kpi label="Caracteres" value={usage.kpis.characters.toLocaleString()} />
          <Kpi label="Coste total" value={fmtMoney(usage.kpis.cost)} accent />
          <Kpi label="Usuarios" value={usage.kpis.users.toLocaleString()} />
          <Kpi label="Coste / usuario" value={fmtMoney(usage.kpis.avgCostPerUser)} />
        </div>

        {/* Daily chart */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Tendencia diaria — coste por proveedor</h2>
            <span className="text-xs text-muted-foreground ml-2">click en una barra para filtrar el día</span>
          </div>
          {usage.loading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : usage.daily.length === 0 ? (
            <p className="text-xs text-muted-foreground py-12 text-center">Sin datos en este rango.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={usage.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(d) => format(parseISO(d), "d MMM", { locale: es })} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(d) => format(parseISO(d as string), "EEEE d MMM yyyy", { locale: es })}
                  formatter={(v, name) => [fmtMoney(Number(v)), name]}
                />
                {usage.allProviders.map((p) => (
                  <Bar key={p} dataKey={`byProvider.${p}`} name={p} stackId="cost" fill={PROVIDER_COLORS[p] || PROVIDER_COLORS.unknown} cursor="pointer">
                    {usage.daily.map((d, i) => (
                      <Cell key={i} onClick={() => updateParam({ day: d.date })} opacity={filters.day && filters.day !== d.date ? 0.3 : 1} />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Breakdown by provider + call type */}
        <div className="grid md:grid-cols-2 gap-4">
          <Breakdown
            title="Por proveedor"
            data={usage.byProvider}
            colorFn={(k) => PROVIDER_COLORS[k] || PROVIDER_COLORS.unknown}
            selected={filters.providers}
            onClick={(k) => toggleInList("providers", k)}
          />
          <Breakdown
            title="Por tipo de llamada"
            data={usage.byCallType}
            colorFn={() => "hsl(var(--primary))"}
            labelFn={(k) => CALL_TYPE_LABELS[k] || k}
            selected={filters.callTypes}
            onClick={(k) => toggleInList("callTypes", k)}
          />
        </div>

        {/* By user table */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Por usuario</h2>
            <span className="text-xs text-muted-foreground ml-2">click en una fila para filtrar</span>
          </div>
          {usage.byUser.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Sin datos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2">Usuario</th>
                    <th className="text-right py-2 px-2">Llamadas</th>
                    <th className="text-right py-2 px-2">Caracteres</th>
                    <th className="text-right py-2 px-2">Coste</th>
                    <th className="text-right py-2 px-2">Última actividad</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byUser.map((u) => {
                    const active = filters.userIds.includes(u.key);
                    return (
                      <tr
                        key={u.key}
                        onClick={() => toggleInList("userIds", u.key)}
                        className={`border-b border-border/30 cursor-pointer hover:bg-secondary/40 ${active ? "bg-primary/5" : ""}`}
                      >
                        <td className="py-2 px-2 font-medium">{u.username}</td>
                        <td className="py-2 px-2 text-right font-mono">{u.calls}</td>
                        <td className="py-2 px-2 text-right font-mono">{u.characters.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono text-amber-600 font-semibold">{fmtMoney(u.cost)}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">
                          {formatDistanceToNow(parseISO(u.lastActivity), { locale: es, addSuffix: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail by day */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Detalle por día</h2>
            <span className="text-xs text-muted-foreground ml-2">solo días con actividad · click en una llamada para ver detalle</span>
          </div>
          {usage.detailByDay.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Sin actividad en este rango.</p>
          ) : (
            <Accordion type="multiple" className="space-y-1">
              {usage.detailByDay.map(([date, rows]) => {
                const dayCost = rows.reduce((s, r) => s + (Number(r.costUsd) || 0), 0);
                return (
                  <AccordionItem key={date} value={date} className="border border-border/30 rounded-lg bg-secondary/20 px-3">
                    <AccordionTrigger className="hover:no-underline py-2.5">
                      <div className="flex items-center justify-between w-full pr-2 text-xs">
                        <span className="font-medium">{format(parseISO(date), "EEEE d MMM yyyy", { locale: es })}</span>
                        <div className="flex gap-4 font-mono">
                          <span className="text-muted-foreground">{rows.length} calls</span>
                          <span className="text-amber-600 font-semibold w-20 text-right">{fmtMoney(dayCost)}</span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-2">
                      <div className="space-y-1">
                        {rows.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setDetailRow(r)}
                            className="w-full text-left grid grid-cols-12 gap-2 py-1.5 px-2 rounded hover:bg-secondary/60 text-xs font-mono"
                          >
                            <span className="col-span-2 text-muted-foreground">{format(parseISO(r.createdAt), "HH:mm:ss")}</span>
                            <span className="col-span-2 truncate">{usage.usernameFor(String(r.userId))}</span>
                            <span className="col-span-2">{CALL_TYPE_LABELS[r.callType] || r.callType}</span>
                            <span className="col-span-2 flex items-center gap-1">
                              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: PROVIDER_COLORS[r.apiProvider || "unknown"] }} />
                              {r.apiProvider || "—"}
                            </span>
                            <span className="col-span-2 text-right text-muted-foreground">{(r.characters || 0).toLocaleString()} ch</span>
                            <span className="col-span-2 text-right text-amber-600 font-semibold">{fmtMoney(Number(r.costUsd) || 0)}</span>
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground font-mono pt-2">PYD Cost Comments · uso interno</p>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">Detalle de llamada</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <dl className="grid grid-cols-3 gap-y-2 text-xs font-mono">
              <DetailRow k="Fecha" v={format(parseISO(detailRow.createdAt), "d MMM yyyy HH:mm:ss", { locale: es })} />
              <DetailRow k="Usuario" v={usage.usernameFor(String(detailRow.userId))} />
              <DetailRow k="Tipo" v={CALL_TYPE_LABELS[detailRow.callType] || detailRow.callType} />
              <DetailRow k="Proveedor" v={detailRow.apiProvider || "—"} />
              <DetailRow k="Modelo" v={detailRow.model || "—"} />
              <DetailRow k="Caracteres" v={(detailRow.characters || 0).toLocaleString()} />
              <DetailRow k="Duración (s)" v={(detailRow.durationSeconds ?? 0).toFixed(1)} />
              <DetailRow k="Coste" v={fmtMoney(Number(detailRow.costUsd) || 0)} accent />
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${accent ? "bg-amber-500/10 border-amber-500/20" : "bg-primary/5 border-primary/10"}`}>
      <p className={`text-xl font-bold font-mono ${accent ? "text-amber-600" : "text-primary"}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

interface BreakdownProps {
  title: string;
  data: { key: string; calls: number; characters: number; cost: number }[];
  colorFn: (k: string) => string;
  labelFn?: (k: string) => string;
  selected: string[];
  onClick: (k: string) => void;
}

function Breakdown({ title, data, colorFn, labelFn, selected, onClick }: BreakdownProps) {
  const max = Math.max(0, ...data.map((d) => d.cost));
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Sin datos.</p>
      ) : (
        <div className="space-y-2">
          {data.map((d) => {
            const active = selected.includes(d.key);
            const pct = max ? (d.cost / max) * 100 : 0;
            return (
              <button
                key={d.key}
                onClick={() => onClick(d.key)}
                className={`w-full text-left p-2 rounded-lg transition-colors ${active ? "bg-primary/10 border border-primary/20" : "hover:bg-secondary/40 border border-transparent"}`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorFn(d.key) }} />
                    {labelFn ? labelFn(d.key) : d.key}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {d.calls} · {fmtMoney(d.cost)}
                  </span>
                </div>
                <div className="h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorFn(d.key) }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailRow({ k, v, accent = false }: { k: string; v: string; accent?: boolean }) {
  return (
    <>
      <dt className="col-span-1 text-muted-foreground">{k}</dt>
      <dd className={`col-span-2 ${accent ? "text-amber-600 font-semibold" : ""}`}>{v}</dd>
    </>
  );
}
