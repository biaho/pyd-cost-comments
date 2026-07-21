/**
 * Packages the deployable source of both services into dist-onprem/*.zip for
 * manual RDP transfer to the on-prem server.
 *
 * The on-prem server is deliberately not git-connected (no repo trace left on
 * the client's machine — see decisions.log.md 21/07/2026), so this replaces
 * Render's git-push-to-deploy with one repeatable command. Ships source only;
 * node_modules and build output are produced on the server by npm install +
 * npm run build.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const OUT_DIR = join(REPO_ROOT, 'dist-onprem');
const LAST_DEPLOY_TAG_PREFIX = 'deployed-onprem';

const APP_ENTRIES = [
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  'eslint.config.mjs',
  'src',
  'public',
  '.env.local.example',
];

const DATA_API_ENTRIES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'src',
  '.env.example',
];

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
}

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Copies the listed entries into a clean staging dir, then zips it. */
function packageService(name: string, sourceRoot: string, entries: string[], suffix: string): void {
  const staging = join(OUT_DIR, `_staging-${name}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const skipped: string[] = [];
  for (const entry of entries) {
    const from = join(sourceRoot, entry);
    if (!existsSync(from)) {
      skipped.push(entry);
      continue;
    }
    cpSync(from, join(staging, entry), { recursive: true });
  }

  const zipPath = join(OUT_DIR, `${name}-${suffix}.zip`);
  rmSync(zipPath, { force: true });
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${join(staging, '*')}' -DestinationPath '${zipPath}'`,
  ]);
  rmSync(staging, { recursive: true, force: true });

  console.log(`  ${name}: ${zipPath}`);
  if (skipped.length > 0) {
    console.log(`    (not found, skipped: ${skipped.join(', ')})`);
  }
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const suffix = stamp();

  console.log('Packaging on-prem deploy bundles...\n');
  packageService('app', REPO_ROOT, APP_ENTRIES, suffix);
  packageService('data-api', join(REPO_ROOT, 'data-api'), DATA_API_ENTRIES, suffix);

  const lastTag = git(['describe', '--tags', '--abbrev=0', '--match', `${LAST_DEPLOY_TAG_PREFIX}-*`]);
  console.log('\nChanged since last on-prem deploy:');
  if (!lastTag) {
    console.log(`  No ${LAST_DEPLOY_TAG_PREFIX}-* tag yet — treat this as a full first deploy.`);
  } else {
    const changed = git(['diff', '--name-only', `${lastTag}..HEAD`]);
    console.log(changed ? `  (since ${lastTag})\n${changed.split('\n').map((f) => `    ${f}`).join('\n')}` : `  Nothing changed since ${lastTag}.`);
  }

  console.log(`
On-server refresh runbook (RDP in, copy the two zips over):
  1. Stop the scheduled tasks:  pyd-cost-comments-app, pyd-cost-comments-data-api
  2. Extract each zip over its existing folder (keeps .env / .env.local in place)
  3. npm install          (only if package.json / package-lock.json changed above)
  4. npm run build        (in both the app folder and data-api/)
  5. Start both scheduled tasks again
  6. Back here: git tag ${LAST_DEPLOY_TAG_PREFIX}-$(date +%Y%m%d) && git push origin --tags
`);
}

main();
