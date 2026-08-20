# Extracker — CI/CD → GHCR → Railway Deployment Runbook

This document describes the production deployment pipeline for **Extracker** and how to operate it.

```
push to main ─▶ GitHub Actions ─▶ build Docker image ─▶ push to GHCR ─▶ railway redeploy
                    (verify)                (public)         │
                                                             ▼
                                          Railway app service pulls image
                                                             │
                                       pre-deploy: prisma migrate deploy
                                                             │
                                                    node server.js (Next.js)
                                                             │
                                                  Railway PostgreSQL  ◀──┘
```

- **App:** Next.js 16 (standalone output), single deployable, Node 22, npm.
- **Registry:** `ghcr.io/tshamugia/extracker` (**public** package).
- **Host:** Railway — project **Extracker**, services **Postgres** + **extracker** (app).
- **DB:** Railway-managed PostgreSQL, schema built by Prisma migrations.

---

## 1. Container build

`Dockerfile` (multi-stage, already present, extended for this pipeline):

- **deps** → `npm ci --legacy-peer-deps` (lockfile copied first for layer caching).
- **builder** → `prisma generate` + `next build`. Takes build-arg `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  (the only client-inlined public var; safe to expose).
- **runner** → `node:22-alpine`, non-root `nextjs` user, `openssl` (Prisma engines), Next standalone
  output, and the **Prisma CLI + engines + migrations** so migrations can run at deploy time.
  Honors `PORT` (Railway injects it), `EXPOSE 3000`, `CMD ["node","server.js"]`.

`.dockerignore` keeps `prisma/` (needed for migrations) and drops `.env*` (except `.env.example`),
`.git`, `scripts`, docs, etc.

Local sanity check:
```bash
docker build --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY=dummy -t extracker:local .
docker run --rm extracker:local ./node_modules/.bin/prisma -v   # prints Prisma version
```

## 2. GitHub Actions → GHCR

`.github/workflows/build-and-publish.yml` — triggers: push to `main`, tags `v*`, `workflow_dispatch`.

| Job | Does |
|-----|------|
| `verify` | `npm ci` → `prisma generate` → `npm run lint` (**non-blocking** — see note) → `npx tsc --noEmit` (**hard gate**). **No test suite exists yet** — the test step is a documented no-op. |
| `build-and-push` | Logs in to GHCR with `GITHUB_TOKEN`; builds with Buildx + GHA cache; tags via `metadata-action`: `latest`, `sha-<short>`, semver on `v*`. Passes `NEXT_PUBLIC_VAPID_PUBLIC_KEY` build-arg. |
| `deploy` | `railway redeploy --service <name> --yes` (only on `main`/tags), which re-pulls the image and runs the pre-deploy migration. |

Permissions on the build job: `contents: read`, `packages: write`, `id-token: write`.

> **Lint gate note.** `npm run lint` currently reports 23 pre-existing errors in tracked source
> (11 `no-explicit-any`, 4 unescaped JSX entities, 4 `react-hooks/set-state-in-effect`,
> 1 `react-hooks/static-components`, 1 `require()` in `test-connection.js`, 2 more `any`) — all
> unrelated to deployment. The lint step is therefore `continue-on-error: true` (visible but
> non-blocking); **typecheck is the hard gate**. Clear this debt in a separate PR, then flip lint
> back to blocking. (The huge local lint count comes from an untracked stray `apps/` dir + `.nx/`
> cache, which never reach CI or the image.)

**GHCR visibility:** the package is **public**, so Railway pulls it with no registry credentials.
(To make it public: GitHub → your profile → Packages → `extracker` → Package settings → Change visibility → Public.
The first push creates it private by default.) If you ever switch to private, add Railway registry
credentials: a GitHub PAT with `read:packages` as the image password + your GitHub username.

**Not an NX monorepo**, so there is no `nx affected` / `nx build` — a single image is built.

## 3. Railway

Provisioned via the Railway CLI / MCP (not the dashboard):

- Project **Extracker**.
- **Postgres** service (Railway PostgreSQL template).
- **extracker** app service, **source = image** `ghcr.io/tshamugia/extracker:latest`.
- **Pre-deploy command:** `npx prisma migrate deploy` (runs once per deploy, before the new version
  starts — not per replica; Prisma also takes a DB advisory lock as a backstop).
- **Health check path:** `/api/health` (already implemented — returns app status + a `SELECT 1` DB check).

### Migrations
- Production uses **`prisma migrate deploy`** only — applies committed migrations in
  `prisma/migrations/`. Never `db push` / `migrate dev` in production.
- The baseline migration `prisma/migrations/00000000000000_init/` was regenerated from
  `prisma/schema.prisma` (the previously committed migration was stale — 4 tables vs. the real 13).
- Author a new migration locally against an empty Postgres:
  ```bash
  npm run db:migrate:dev -- --name <change>   # creates prisma/migrations/<ts>_<change>
  ```
- Run migrations manually against Railway:
  ```bash
  railway run --service extracker npx prisma migrate deploy
  railway run --service extracker npx prisma migrate status   # verify
  ```

## 4. Environment variables

Set on the Railway **extracker** service (`railway variables --set '<KEY>=<VALUE>'`):

| Var | Value |
|-----|-------|
| `DATABASE_URL` | reference `${{Postgres.DATABASE_URL}}` |
| `DIRECT_URL` | reference `${{Postgres.DATABASE_URL}}` |
| `NODE_ENV` | `production` |
| `PORT` | injected by Railway (do not set) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` / `NEXTAUTH_URL` | the generated Railway domain (https) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | optional (console-logs emails if unset) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | optional (`npx web-push generate-vapid-keys`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | equals `VAPID_PUBLIC_KEY` (also a repo Variable for the build-arg) |

`SUPABASE_*` are **not** required on Railway (used only by local scripts + the test route).
`.env` is gitignored (`.env*`); `.env.example` is the tracked template (`!.env.example`).

After setting the Google vars, add the production callback URL in Google Cloud Console:
`https://<railway-domain>/api/auth/callback/google`.

### GitHub repo config (Settings → Secrets and variables → Actions)
- **Secret** `RAILWAY_TOKEN` — a Railway **project token** (Project → Settings → Tokens), scoped to the
  Extracker project/environment. Used by the `deploy` job.
- **Variable** `RAILWAY_SERVICE_NAME` — the app service name (`extracker`).
- **Variable** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — public VAPID key (build-arg).
- `GITHUB_TOKEN` is automatic (GHCR push).

## 5. Deploy & verify

1. Push to `main` (or run the workflow via **Actions → Build & Publish → Run workflow**).
2. Watch the run: `verify` → `build-and-push` (confirm tags in GHCR) → `deploy`.
3. Confirm on Railway:
   ```bash
   railway status
   railway logs --service extracker      # look for "prisma migrate deploy" applying migrations
   ```
4. Hit the health endpoint:
   ```bash
   curl https://<railway-domain>/api/health
   # {"status":"healthy","database":"connected", ...}
   ```
5. Confirm migrations: `railway run --service extracker npx prisma migrate status` → all applied.

## 6. Rollback

Images are tagged immutably as `sha-<short>` (and semver on `v*`), so any past build is redeployable.

- **Preferred:** repoint the app service image to a previous tag
  `ghcr.io/tshamugia/extracker:sha-<older>` (Railway dashboard → service → Settings → Source → Image,
  or via the Railway API/MCP `update_service`), which triggers a redeploy of that exact build.
- **Or:** Railway dashboard → service → Deployments → pick a previous successful deployment → **Redeploy**.
- **Database:** migrations are forward-only. Roll back the app image, and only reverse a schema change
  with a **new** corrective migration — never edit an already-applied migration.

## Files created / changed

- `implementation.md` — this runbook.
- `Dockerfile` — Prisma CLI/engines + `openssl` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` build-arg.
- `.github/workflows/build-and-publish.yml` — verify → build-push → deploy.
- `prisma/migrations/00000000000000_init/migration.sql` — regenerated baseline (stale one removed).
- `package.json` — `db:migrate`, `db:migrate:dev`, `db:migrate:deploy` scripts.
- `.env.example` — full documented variable list.
- `.gitignore` — `!.env.example` exception.
