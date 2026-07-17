# pyd-cost-comments

TARGIT cost-comment annotation app for Perfuydisen (PYD). Business users viewing a
product cost report in TARGIT (BI tool over an OLAP cube) click through to this app
to add a typed or voice comment explaining a cost deviation — keyed to the report's
business dimensions (product, cost type, period, region). TARGIT's own nightly
ETL/cube refresh picks up the comment as a new column the next day.

Full spec, architecture decisions, and status: see the engagement's vault index
(`02_AI_Agent/clients/PYD/pyd-cost-comments/_INDEX.md`) — this repo is the code,
the vault is the source of truth for decisions/history.

## Stack

- Next.js (App Router, TypeScript, Tailwind) — frontend + API routes in one deployable
- `mssql` — server-side only, talks to PYD's on-prem SQL Server (never exposed to the client)
- MSAL (`@azure/msal-browser` + `@azure/msal-react`) — Entra ID SSO, single-tenant

Next.js was chosen over Vite (the `pyd-audio-studio` precedent) because the deploy
target (our Vercel vs. PYD's Azure) isn't settled yet and this app needs a real
backend to hold the SQL Server credentials — Next.js API routes run natively on
Vercel and deploy just as well to Azure App Service, so the choice doesn't lock in
the deploy decision.

## Local dev

1. `npm install`
2. Copy `.env.local.example` → `.env.local`, fill in the on-prem DB connection
   details and the Entra ID App Registration values.
3. Connect to PYD's VPN (needed to reach the on-prem SQL Server).
4. `npm run test:db` — proves the DB connection works before building anything
   against it.
5. `npm run dev` — starts the app at http://localhost:3000.
