# ops/ — on-prem release automation

Replaces the manual on-server runbook (`prompts/onprem-server-setup-runbook.md`
Parts 2/7 in the vault, `skills/deploy-onprem.md`) with two one-shot scripts.
The agent never runs these — MS runs them himself over RDP / locally, per the
standing "agent never runs commands on client infrastructure" rule.

## One-time server setup

Copy this whole `ops/` folder to the server once, outside the deployed app
folders so it survives being overwritten by a redeploy:

```
C:\ops\pyd-cost-comments\   <- copy ops/*.ps1 and ops/*.cmd here
C:\deploy-drop\             <- create this empty; zips land here each release
```

## Day-to-day release (code changed)

1. **Dev machine:** `npm run package:onprem` — produces
   `dist-onprem\app-<stamp>.zip`, `data-api-<stamp>.zip`, and
   `manifest-<stamp>.json`.
2. Copy all three files into `C:\deploy-drop\` on the server (RDP clipboard).
3. **On the server:** double-click `C:\ops\pyd-cost-comments\redeploy-onprem.cmd`
   (or run `redeploy-onprem.ps1` from an admin PowerShell for more control).
   It auto-detects the newest manifest/zips in the drop folder and does
   everything: stop both scheduled tasks -> kill anything still holding
   ports 3000/4000 -> extract both zips (never touches `.env`/`.env.local`,
   they're not in the zips) -> `npm install` only for whichever service's
   `package.json`/`package-lock.json` actually changed (per the manifest) ->
   `npm run build` in both -> start both tasks -> poll `/health` and `:3000`
   until healthy or timeout.
4. Once it prints "Redeploy complete and healthy": sanity-check from a LAN
   browser (`http://PERDIS032/`), then tag the release on the dev machine
   (`git tag deployed-onprem-<yyyymmdd> && git push origin --tags`) and log
   it in `logs/sessions.log.md`.

Useful flags: `-SkipInstall` (you know deps didn't change, skip both
installs), `-ForceInstall` (ignore the manifest, install both anyway),
`-NoStart` (stop after a successful build, leave both services down for
manual inspection before going live).

## Env-var-only change (no code change)

Edited `.env` or `.env.local` directly on the server? No need for the full
redeploy — env vars are only read at process start, so just:

```
C:\ops\pyd-cost-comments\restart-onprem.cmd
```

Stops both scheduled tasks, kills anything still on 3000/4000, starts them
again, polls health. No unzip, no install, no build.

## Local dev convenience

Changed `.env.local` while running `npm run dev` locally? Next.js (and
`tsx watch`) only read `.env*` at process start, so editing it while the dev
server is running has no effect until you restart. One command handles that:

```
npm run dev:restart
```

Kills anything on 3000/4000, opens both dev servers (`data-api` and the app)
in fresh windows so they pick up the new values.

## Defaults (override via params if the server layout ever changes)

| Param | Default |
|---|---|
| Drop folder | `C:\deploy-drop` |
| App path | `C:\apps\pyd-cost-comments` |
| Data API path | `C:\apps\pyd-cost-comments\data-api` |
| App task name | `pyd-cost-comments-app` |
| Data API task name | `pyd-cost-comments-data-api` |

## Known limitation

`npm approve-scripts --all` is called after a fresh `npm install` (approves
native postinstall scripts like esbuild's, per the gotcha hit live on
21/07/2026). It's a no-op ("Unknown command") on npm versions that don't have
it — harmless either way; if scripts really were needed and blocked, the next
`npm run build` step fails with a clear error instead of silently.

Not handled: files removed between releases aren't deleted from the deployed
folder (`Expand-Archive -Force` only overwrites/adds what's in the new zip).
Not an issue at this app's current size/rate of change; revisit if it ever
becomes one (option: wipe everything except `.env*` before extracting).
