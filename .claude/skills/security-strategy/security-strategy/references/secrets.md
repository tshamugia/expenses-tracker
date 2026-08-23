# Secrets management & leak detection

A secret is anything whose disclosure grants access or impersonation: DB URLs with credentials, JWT signing keys, OAuth client secrets, API keys (Stripe, AWS, SMTP), webhook signing secrets, encryption keys, session secrets. The rules: never in the client bundle, never in git, loaded at runtime, rotatable.

## Table of contents
- What must never reach the client (Next.js bundle rules)
- Storage & loading at runtime
- Rotation
- Detecting committed / leaked secrets
- CI/CD exposure
- Audit checklist

---

## What must never reach the client (Next.js)

This is the most common secret leak in this stack.
- In Next.js, **any env var prefixed `NEXT_PUBLIC_` is inlined into the client JS bundle** and is world-readable. A secret behind `NEXT_PUBLIC_` is a disclosed secret. Grep for `NEXT_PUBLIC_` and confirm none reference keys/tokens/DB.
- Server-only secrets are read in Server Components, Route Handlers, Server Actions, or API code — never imported into a Client Component (`'use client'`). A secret referenced in a file that is, directly or transitively, in the client graph ships to the browser.
- Don't pass secrets as props from server to client components, and don't embed them in HTML/JSON the page returns.
- Source maps in production can re-expose inlined values — disable or restrict them.

## Storage & loading at runtime
- Local dev: `.env.local` / `.env` that is **git-ignored**. Commit a `.env.example` with keys but placeholder values only.
- Prod: inject via the platform's secret store (Hetzner/Coolify env, Doppler, Vault, cloud secret manager) at runtime — not baked into the image, not in `docker-compose.yml` committed to the repo.
- Validate presence and shape at boot with a schema (Zod / Nest `ConfigModule` validation) so a missing secret fails fast and loudly rather than silently degrading to an insecure default.
- Never log secrets. Configure logger redaction (pino `redact`) for `authorization`, `password`, `token`, `secret`, `cookie`, `set-cookie`, connection strings.

## Rotation
- Every secret has an owner and a rotation path. Signing keys (JWT/session) support **overlapping** keys (kid-based) so you can rotate without invalidating all live sessions at once.
- On suspected leak: rotate immediately, invalidate sessions/tokens signed with the old key, and audit access logs. A committed secret is compromised the moment it's pushed — rotate it; removing the commit is not enough because history and clones persist it.
- Webhook/HMAC secrets and DB passwords rotate on a schedule and on personnel changes.

## Detecting committed / leaked secrets

```bash
# Is .env actually ignored? (should print nothing / a gitignore line)
git check-ignore .env .env.local; cat .gitignore | grep -i env

# Tracked files that look like env/secret files (should be empty except .env.example)
git ls-files | grep -Ei '\.env($|\.)' | grep -v example

# Scan current tree for high-signal patterns
grep -rEn "(AKIA[0-9A-Z]{16}|sk_live_[0-9a-zA-Z]{24,}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----|xox[baprs]-[0-9A-Za-z-]+|ghp_[0-9A-Za-z]{36})" \
  --include=*.ts --include=*.tsx --include=*.js --include=*.json --include=*.env* .

# Secrets reaching the client
grep -rEn "NEXT_PUBLIC_" --include=*.ts --include=*.tsx .
```
- Scan **history**, not just HEAD: tools like `gitleaks detect`, `trufflehog`, or `git log -p -S<pattern>` find secrets removed from HEAD but still in history.
- Add a pre-commit hook (`gitleaks`/`detect-secrets`) and a CI secret-scan gate so new leaks are blocked, not just found later.
- Hardcoded credentials in source (not env at all) are a HIGH finding even in private repos — anyone with repo read access gets them, and they end up in CI logs and forks.

## CI/CD exposure
- Secrets in CI come from the CI secret store (GitHub Actions `secrets.*`), never echoed. Beware `echo`/`set -x` printing env, or `npm` scripts dumping config.
- A secret used at **build** time in Next.js may be baked into artifacts — prefer runtime injection for anything sensitive.
- Restrict which workflows/branches can read which secrets; fork PRs must not get production secrets.

## Audit checklist
- [ ] No secret behind `NEXT_PUBLIC_`; no secret imported into a `'use client'` graph
- [ ] `.env*` git-ignored (except `.env.example` with placeholders); confirmed via `git ls-files`
- [ ] History scanned (gitleaks/trufflehog), not just current tree
- [ ] Prod secrets injected at runtime from a secret store, not committed/baked
- [ ] Boot-time schema validation for required secrets (fail fast)
- [ ] Logger redaction configured for auth/token/cookie/connection-string fields
- [ ] Signing keys support overlapping rotation (kid); rotation runbook exists
- [ ] Pre-commit + CI secret scanning gate in place
- [ ] Any found committed secret treated as compromised → rotated, not just deleted
