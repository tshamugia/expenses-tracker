# Security bug finder — systematic source-code vulnerability hunting

Use this to hunt for concrete vulnerabilities in code, at scale. Workflow: (1) map entry points and trust boundaries, (2) trace tainted data from each source to dangerous sinks, (3) confirm reachability before reporting, (4) write findings in the standard format. Greps and static tools surface *candidates*; only confirmed-reachable issues are findings.

## Table of contents
- Method: taint sources → sinks
- Vulnerability classes with detection patterns and fixes
- Tooling (Semgrep, CodeQL, audit, Snyk)
- Triage: confirming reachability and severity

---

## Method: taint sources → sinks

**Sources (untrusted):** request params/query/body/headers/cookies, route params, Server Action arguments, webhook payloads, file uploads, third-party API responses, DB values originally set by users, message-queue/socket payloads.

**Sinks (dangerous if tainted):** raw SQL, `exec`/`execFile`/`spawn`, `eval`/`Function`/`vm`, `fs` path operations, outbound `fetch`/`http` (SSRF), `dangerouslySetInnerHTML`/template HTML, deserializers, redirect targets, regex built from input (ReDoS), object merges (`Object.assign`/spread into a base — prototype pollution).

For each source, follow the value. If it reaches a sink without validation/encoding/parameterization appropriate to that sink, you likely have a bug.

---

## Vulnerability classes

### SQL / NoSQL injection
```bash
grep -rEn "queryRawUnsafe|executeRawUnsafe|\\\$queryRawUnsafe|\\\$executeRawUnsafe" --include=*.ts
grep -rEn "sql\s*=|\.query\(\s*[\`'\"].*\$\{" --include=*.ts   # string-built queries
```
- Prisma/Drizzle builders parameterize automatically — safe. `$queryRaw\`…${x}…\`` / `sql\`…${x}…\`` *tagged templates* parameterize — safe. The `*Unsafe` variants and string-concatenated SQL are NOT — finding.
- Mongo/NoSQL: object injection via `{ $gt: '' }` passed where a scalar is expected; validate types.
- **Fix:** parameterize; if dynamic identifiers (table/column) are unavoidable, allow-list them against a fixed set.

### Command injection
```bash
grep -rEn "exec\(|execSync\(|spawn\(.*shell\s*:\s*true|`.*\$\{" --include=*.ts
```
- `exec(\`convert ${name}\`)` → injectable. **Fix:** `execFile('convert', [name])` with an args array, `shell:false`.

### SSRF
- User-controlled URL fetched server-side (webhook tester, "import from URL", image proxy, Next.js rewrite). **Fix:** allow-list hosts; reject private/link-local/metadata ranges (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16 incl. 169.254.169.254, `::1`, `fc00::/7`); resolve DNS then validate the resolved IP (defeats rebinding); disable redirects or re-validate each hop; set timeouts.

### XSS (Next.js / React)
```bash
grep -rEn "dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|document\.write" --include=*.tsx --include=*.ts
```
- React auto-escapes text. Risk is in escape hatches, unsanitized markdown/HTML, `href`/`src` with `javascript:` URIs, reflected query params rendered as HTML. **Fix:** sanitize with DOMPurify before `dangerouslySetInnerHTML`; validate URL schemes; rely on JSX escaping; add a strict CSP as defense-in-depth.

### CSRF
- Cookie-based sessions on state-changing requests need CSRF defense: `SameSite=Lax/Strict` cookies (baseline) plus a CSRF token for sensitive POSTs, or the double-submit pattern. Pure bearer-token-in-header APIs are largely CSRF-immune but then must not also accept the cookie. Next.js Server Actions have built-in origin checks — don't disable them.

### Prototype pollution
```bash
grep -rEn "Object\.assign\(|_\.merge\(|\.\.\.req\.(body|query)" --include=*.ts
```
- Merging untrusted objects into a base can set `__proto__`/`constructor.prototype`. **Fix:** validate with a strict schema first (Zod `.strict()`), use `Object.create(null)` maps, or libraries hardened against `__proto__`.

### Insecure deserialization / code exec
```bash
grep -rEn "\beval\(|new Function\(|vm\.|node-serialize|unserialize\(" --include=*.ts
```
- Any of these on tainted input is CRITICAL. `JSON.parse` is fine (but still validate the shape after).

### Path traversal
```bash
grep -rEn "readFile|createReadStream|sendFile|path\.join\(.*req" --include=*.ts
```
- `path.join(baseDir, req.params.file)` with `../../etc/passwd`. **Fix:** resolve and assert the result stays within `baseDir` (`resolved.startsWith(baseDirResolved + sep)`); allow-list filenames.

### ReDoS
- Regex with catastrophic backtracking (`(a+)+`, nested quantifiers) run on user input. **Fix:** linear-time patterns, input length caps, or `re2`.

### Open redirect
- Redirect target from user input (`?next=…`). **Fix:** allow-list relative paths / known hosts.

### Race conditions / TOCTOU
- Check-then-act on balances, quotas, uniqueness, idempotency: two concurrent requests both pass the check. **Fix:** do it in one atomic statement (conditional `UPDATE … WHERE balance >= x`), unique constraints, `SELECT … FOR UPDATE`, or idempotency keys.

### Insufficient validation / mass assignment
- See `references/auth.md` — strict input DTOs, no spreading request bodies into writes.

---

## Tooling

```bash
# Dependency vulnerabilities
npm audit --omit=dev      # or: pnpm audit / yarn npm audit
npx snyk test             # if Snyk available

# Pattern-based SAST (fast, good signal for this stack)
semgrep --config p/typescript --config p/owasp-top-ten --config p/nextjs --config p/javascript .

# Deep dataflow SAST
# CodeQL: github/codeql with the javascript-typescript pack — best for taint tracking across files

# Secret scanning (history too)
gitleaks detect --no-banner

# Type-level safety baseline
tsc --noEmit --strict   # `any` and unchecked nulls hide bugs
```
- Treat tool output as candidates. Semgrep/CodeQL have false positives; `npm audit` flags unreachable transitive issues. Confirm reachability before reporting, and downgrade unreachable ones to INFO with a note.

## Triage: confirming reachability and severity
For each candidate ask:
1. **Reachable?** Is there an actual path from an untrusted source to this sink in running code (not dead code, not test fixtures)?
2. **Who's the attacker?** Anonymous, any authenticated user, a specific tenant, an insider? Lower precondition = higher severity.
3. **What's the impact?** Data read/write across boundaries, RCE, account takeover, DoS?
4. **What mitigations already exist?** A WAF/CSP/RLS backstop may reduce (but rarely eliminate) severity — note it under residual risk.

Then write it up in the standard finding format from SKILL.md, lead with the worst, and give a copy-ready fix.
