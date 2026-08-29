# ფაზა 0 — სამუშაო პროცესი და CI/CD კარიბჭეები

**PRD:** პროცესის წინაპირობა ყველა ფაზისთვის (CLAUDE.md „Testing" წესის აღსრულება CI დონეზე)
**მზადაა, როცა:** PR-ზე ავტომატურად ეშვება ტესტები/typecheck/build და წითელი შემოწმებით მერჯი შეუძლებელია; სქემის ყველა ცვლილება მიგრაციის ფაილით მიდის — ჯერ Supabase dev ბაზაზე, მერჯის შემდეგ კი CI/CD-ით პროდაქშენზე — მონაცემების დაკარგვის გარეშე.

---

## 1. მიმოხილვა

სანამ ფაზა 1–6-ის იმპლემენტაცია დაიწყება, პროცესი უნდა დაიკეტოს ორ წერტილში:

1. **PR-ის კარიბჭე** — ტესტები და build ეშვება *მერჯამდე*. დღეს CI (`build-and-publish.yml`) მხოლოდ `main`-ზე push-ისას ეშვება, ე.ი. გატეხილი კოდი ჯერ იმერჯება და მხოლოდ მერე ვიგებთ. ტესტის ნაბიჯი ამჟამად no-op-ია.
2. **მიგრაციული DB-ნაკადი** — სქემის ცვლილება ჯერ **Supabase dev ბაზაზე** იტესტება მიგრაციის ფაილის სახით, პროდაქშენზე (Railway Postgres) კი მხოლოდ მერჯის შემდეგ, CI/CD-ის გავლით ხვდება. `prisma db push` სქემის ცვლილებისთვის აღარ გამოიყენება — ის migration history-ს გვერდს უვლის და დესტრუქციული diff-ის გაფრთხილების გარეშე გატარება შეუძლია (ზუსტად ამ რისკის გამო გაჩნდა ცალკე `db:add-push` სკრიპტი `RefreshToken` ცხრილის დასაცავად).

პროდაქშენ-მხარე უკვე მზადაა: Railway-ს pre-deploy ბრძანება `prisma migrate deploy`-ს უშვებს ყოველ დეპლოიზე და baseline მიგრაცია (`prisma/migrations/00000000000000_init`) დადასტურებულად მუშაობს. ეს ფაზა dev-მხარეს და PR-კარიბჭეს აწესრიგებს.

## 2. Scope / Out of scope

**Scope:**
- Vitest-ის მინიმალური bootstrap (`npm run test` + smoke-ტესტი), რომ ტესტის ნაბიჯი CI-ში პირველივე დღიდან მკაცრი კარიბჭე იყოს.
- ახალი CI workflow PR-ებისთვის: lint → typecheck → **test** → build.
- `build-and-publish.yml`-ში no-op ტესტის ნაბიჯის ჩანაცვლება რეალური `npm run test`-ით.
- Branch protection `main`-ზე: მერჯი მხოლოდ მწვანე შემოწმებებით.
- მიგრაციის ნაკადის წესები (dev ლოკალური Docker Postgres → prod Railway) + დესტრუქციული SQL-ის ავტომატური დარაჯი CI-ში.
- Railway Postgres-ის ბექაფის ჩართვა.

**Out of scope:** React Testing Library და კომპონენტ-ტესტების სრული სეტაპი (ფაზა 1 §8 — ეს ფაზა მხოლოდ ჩარჩოს დგამს); E2E ტესტები; staging გარემო (dev ბაზა + prod საკმარისია ამ მასშტაბზე).

## 3. სამუშაო ნაკადი (ყველა მომდევნო ფაზაზე ვრცელდება)

```
feature branch
   │  ლოკალურად: npm run build && npm run test   ← PR არ იხსნება, სანამ ორივე მწვანეა
   │  სქემის ცვლილება: npm run db:migrate:dev    ← მიგრაციის SQL იქმნება და ლოკალურ Docker dev ბაზაზე ტესტდება
   ▼
Pull Request  ──►  CI (pr-checks): lint · tsc · test · build · migration-guard
   │                        └─ წითელი = მერჯი დაბლოკილია (branch protection)
   ▼
merge → main  ──►  CI (build-and-publish): verify → Docker image → GHCR → railway redeploy
   ▼
Railway pre-deploy: prisma migrate deploy   ← მხოლოდ დაკომიტებული მიგრაციის ფაილები
   ▼
production (მიგრაცია წარმატებულია → ახალი ვერსია ეშვება; ჩავარდა → ძველი ვერსია რჩება)
```

### PR-ის წესი (checklist PR-ის გახსნამდე)

1. `npm run build` — გადის შეცდომების გარეშე.
2. `npm run test` — ყველა ტესტი მწვანეა.
3. ახალ/შეცვლილ ლოგიკას ტესტები ახლავს (CLAUDE.md „Testing" წესი).
4. სქემა შეიცვალა? → მიგრაცია შექმნილია `npm run db:migrate:dev`-ით, ლოკალურ Docker dev ბაზაზე გატესტილია და მიგრაციის SQL ხელით არის გადახედილი (იხ. §5 checklist).

### DB-გარემოების როლები

| გარემო | ბაზა | ვინ ცვლის სქემას | წესი |
|---|---|---|---|
| Development | ლოკალური Docker Postgres (`.env.local`, `localhost:5433`) | დეველოპერი — `npm run db:migrate:dev` | ერთადერთი ადგილი, სადაც მიგრაცია იქმნება. Reset/seed ნებადართულია — მონაცემები disposable-ია. |
| Production | Railway Postgres (internal-only) | მხოლოდ CI/CD — pre-deploy `prisma migrate deploy` | ლოკალური კავშირი არ არსებობს და არც უნდა გაჩნდეს. `db push` / `migrate reset` აკრძალულია. |

## 4. CI ცვლილებები

### 4.1 ახალი workflow: `.github/workflows/pr-checks.yml`

ტრიგერი: `pull_request` (target: `main`). ნაბიჯები:

```yaml
- npm ci --legacy-peer-deps
- npx prisma generate
- npm run lint          # non-blocking (არსებული lint-ვალი), continue-on-error: true
- npx tsc --noEmit      # მკაცრი
- npm run test          # მკაცრი
- npm run build         # მკაცრი — Next.js production build
- migration-guard       # იხ. §5.3 — მკაცრი, override ლეიბლით
```

ცალკე workflow (და არა `build-and-publish.yml`-ში `pull_request` ტრიგერის დამატება), რომ PR-ზე Docker image არ შენდებოდეს/ქვეყნდებოდეს.

### 4.2 `build-and-publish.yml`

- `verify` job-ში no-op ნაბიჯი `Test (none present)` იცვლება `npm run test`-ით (მკაცრი). ეს მეორე ხაზის დაცვაა — თუ რამე CI-ის გვერდის ავლით მოხვდა `main`-ზე, დეპლოი მაინც გაჩერდება.

### 4.3 Branch protection (GitHub-ის პარამეტრი, ხელით)

`main`-ზე: ✅ Require a pull request before merging · ✅ Require status checks to pass (`pr-checks`) · ✅ Require branches to be up to date.

## 5. მონაცემების დაცვა პროდაქშენში (no data loss)

### 5.1 რატომ არის მიგრაციული ნაკადი თავად დაცვა

- `prisma migrate deploy` **მხოლოდ დაკომიტებულ მიგრაციის ფაილებს** ატარებს — არასდროს აგენერირებს diff-ს, არასდროს აკეთებს reset-ს და **არ ეხება სქემის-გარეშე ცხრილებს** (მაგ. `RefreshToken`).
- მიგრაციის SQL PR-ის diff-ში ჩანს → კოდივით იხედება review-ზე, გაშვებამდე.
- ჩავარდნილი მიგრაცია Railway-ზე დეპლოის აჩერებს — ძველი ვერსია ძველ სქემაზე აგრძელებს მუშაობას.

### 5.2 დესტრუქციული ცვლილების წესები (review checklist)

მიგრაციის SQL-ში **აკრძალულია** განსაკუთრებული პროცედურის გარეშე:

| ოპერაცია | რისკი | ალტერნატივა |
|---|---|---|
| `DROP TABLE` / `DROP COLUMN` | მონაცემი ისპობა | Expand–contract (ქვემოთ) |
| `TRUNCATE` / მასობრივი `DELETE` | მონაცემი ისპობა | — არასდროს მიგრაციაში |
| `NOT NULL` არსებულ სვეტზე `DEFAULT`-ის გარეშე | მიგრაცია ჩავარდება ან ჩანაწერები დაიბლოკება | ჯერ `DEFAULT` + backfill, მერე `NOT NULL` |
| ტიპის დავიწროება (მაგ. `TEXT` → `VARCHAR(50)`) | ჩუმი truncation/ჩავარდნა | ახალი სვეტი + backfill |
| `RENAME` სვეტის/ცხრილის | Prisma-ს diff-ი ხშირად drop+create-დ თარგმნის | ხელით გადაწერე მიგრაცია `ALTER ... RENAME`-ზე |

**Expand–contract** (როცა წაშლა/გადარქმევა მართლა საჭიროა) — სამ ცალკე რელიზად:
1. *Expand:* ახალი სვეტი/ცხრილი ემატება, ძველი რჩება; კოდი ორივეს წერს.
2. *Migrate:* backfill + კოდი მთლიანად ახალზე გადადის.
3. *Contract:* ძველის წაშლა — მხოლოდ მას შემდეგ, რაც პროდაქშენზე მინიმუმ ერთი სტაბილური რელიზი ახალზე იმუშავებს.

### 5.3 Migration-guard (CI ნაბიჯი `pr-checks`-ში)

PR-ში დამატებული `prisma/migrations/**/*.sql` ფაილები მოწმდება დესტრუქციულ ნიმუშებზე (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM`). თანხვედრისას job წითლდება, სანამ PR-ს არ დაედება ლეიბლი `migration:destructive-approved` — ე.ი. დესტრუქციული SQL მხოლოდ შეგნებული, ექსპლიციტური გადაწყვეტილებით გადის.

### 5.4 ბექაფი

- Railway Postgres-ზე ირთვება ყოველდღიური ბექაფი (Railway dashboard → Postgres service → Backups).
- დესტრუქციულ-მოლოდინიანი მიგრაციის მერჯამდე — ხელით snapshot/`pg_dump` (`railway ssh`-ით, ბაზა internal-only-ა).

## 6. ეტაპები

| # | ეტაპი | შედეგი |
|---|---|---|
| 1 | Vitest bootstrap: `vitest` + `vitest.config.ts` (`@/` alias) + `test`/`test:watch` სკრიპტები + 1 smoke-ტესტი (მაგ. `lib/utils/`-ის არსებულ სუფთა ფუნქციაზე) | `npm run test` მუშაობს და მწვანეა |
| 2 | `.github/workflows/pr-checks.yml` (§4.1) | PR-ზე ეშვება lint/tsc/test/build |
| 3 | Migration-guard ნაბიჯი `pr-checks`-ში (§5.3) | დესტრუქციული SQL იჭერს |
| 4 | `build-and-publish.yml`: no-op ტესტი → `npm run test` | `main`-ის pipeline-შიც მკაცრი ტესტ-კარიბჭეა |
| 5 | Branch protection `main`-ზე (§4.3) — GitHub Settings, ხელით | წითელი PR ვერ იმერჯება |
| 6 | Railway ბექაფის ჩართვა (§5.4) — dashboard, ხელით | ყოველდღიური snapshot |
| 7 | დოკუმენტაციის განახლება: CLAUDE.md-ში `db:migrate:dev`-ის, PR-წესის და `prisma:push`-ის deprecated სტატუსის ასახვა | წესები ერთ ადგილას წერია |

## 7. ტესტირება (Definition of Done-ის ნაწილი)

პროცესის ფაზაა, ამიტომ ტესტები = ნაკადის ბოლო-ბოლო გადამოწმება:

- [ ] **Smoke-ტესტი** გადის ლოკალურად (`npm run test`) — Vitest-ის სეტაპი მუშაობს.
- [ ] **წითელი PR იბლოკება:** სატესტო PR განზრახ გატეხილი ტესტით → `pr-checks` წითლდება → GitHub მერჯს არ უშვებს. ტესტის გასწორება → მწვანე → მერჯი იხსნება.
- [ ] **Migration-guard მუშაობს:** სატესტო PR `DROP COLUMN`-იანი SQL-ით → job წითელია; ლეიბლით → მწვანე. (PR იხურება მერჯის გარეშე.)
- [ ] **სრული მიგრაციული წრე:** უწყინარი მიგრაცია (მაგ. კომენტარი ან ინდექსი) → `db:migrate:dev` Supabase dev-ზე → PR → merge → Railway deploy-ლოგებში `migrate deploy`-ის წარმატება → პროდაქშენის მონაცემები ხელუხლებელია.

## 8. Definition of Done

- [ ] §6-ის შვიდივე ეტაპი შესრულებულია.
- [ ] §7-ის ოთხივე გადამოწმება ჩატარებულია.
- [ ] README.md-ში (docs/phases) ფაზა 0-ის სტატუსი ✅-ზეა გადაყვანილი.
