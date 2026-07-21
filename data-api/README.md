# pyd-cost-comments — on-prem Data API

The only piece of this project that runs inside PYD's domain and talks to SQL
Server directly. Everything else (the Next.js app, on Render) reaches the
database through this API over HTTPS via Tailscale Funnel — never a direct
DB connection from outside the domain.

Full rationale: `../../_INDEX.md` §2 Phase B and `../../logs/decisions.log.md`
(17/07/2026, "Phase B bridge tech decided" + the same-day deploy-target
correction to Render).

## Why this exists

Keeping SQL Server access behind a narrow, parameterized-query HTTP boundary
(rather than tunnelling raw TDS traffic, or having the app connect directly)
is a deliberate security choice, independent of which host runs the Next.js
app — it means the app never holds on-prem DB credentials, and this API
never accepts anything but the specific operations it was built for. This is
a small, always-on Express service: it owns the SQL Server connection pool,
exposes one narrow endpoint per operation the app needs (never raw SQL), and
is reached by the Next.js backend over plain HTTPS — the same shape
regardless of whether the caller ends up being Render, Vercel, Azure, or
anything else later.

## Setup

```
cd data-api
npm install
cp .env.example .env   # fill in DB_* and generate a DATA_API_KEY
npm run dev             # local dev, tsx watch
```

`DATA_API_KEY` must match the `DATA_API_KEY` env var configured on the
Next.js/Render side — it's the shared secret between the two services.

## Running persistently on the on-prem host

This must run continuously (not from a developer's laptop). Once the host
machine is identified (see the open item in `_INDEX.md` Phase B), run it as
an actual service so it survives reboots:

- **Windows:** `npm run build` then run `dist/server.js` under NSSM or Task
  Scheduler (run at startup, restart on failure), or `pm2` + `pm2-windows-startup`.
- **Linux:** `npm run build` then a systemd unit (`Restart=always`) pointing
  at `node dist/server.js`.

## Exposing it via Tailscale Funnel

No inbound firewall rule needed, and no domain/DNS setup — the tunnel makes
an outbound-only connection from this machine, and Tailscale assigns a
stable `https://<machine>.<tailnet>.ts.net` hostname automatically (chose
this over Cloudflare Tunnel specifically to avoid touching `biaho.com`'s
production DNS — see `decisions.log.md`).

```
tailscale up                              # join this machine to our tailnet
tailscale funnel --bg 4000                # expose localhost:4000 publicly
tailscale funnel status                   # confirm the assigned hostname
```

Run `tailscaled` as a service (installed automatically by the Tailscale
Windows/Linux installer) so the tunnel survives reboots independently of the
Data API process; `tailscale funnel --bg` persists the funnel config across
`tailscaled` restarts.

The resulting `https://<machine>.<tailnet>.ts.net` hostname becomes
`DATA_API_URL` on the Render side.

## Endpoints

All require `Authorization: Bearer <DATA_API_KEY>` except `/health`.

| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| GET | `/health` | — | Liveness check, unauthenticated |
| POST | `/report/resolve` | `{ reportId, reportName? }` | Find-or-create `dim_report` row |
| POST | `/user/resolve` | `{ entraObjectId, userPrincipalName, displayName }` | Find-or-create `app_user` row |
| GET | `/product/resolve` | `?productId=` | Read-only lookup in DWH's `view_dim_product` (cross-DB); `{ product: null }` if unknown |
| GET | `/comments` | `?reportKey=&productId=` | Shared comment history, newest first |
| POST | `/comments` | `SaveCommentParams` | Append-only comment insert |
| POST | `/comments/soft-delete` | `{ commentEntryKey, requestingUserKey }` | Hide own comment (ownership enforced in SQL) |
| POST | `/usage-log` | `TranscriptionUsageParams` | Log ElevenLabs STT usage/cost |
| GET | `/usage-log` | `?start=&end=` | Admin usage dashboard data |
