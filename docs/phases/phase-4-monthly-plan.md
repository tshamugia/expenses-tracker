# ფაზა 4 — ავტომატური თვიური გეგმა, დაშბორდი, პროგრესის თრექინგი

**PRD:** §6 (ჩანჩქერი), §7.5 (თვიური გეგმა — სისტემის გული), §7.6 (პროგრესის თრექინგი), §7.7 (დაშბორდი), R3 (Safe to spend = მთავარი პროდუქტი), R4 (თვის დახურვის რიტუალი), R7 (ტრენდი > ერთი თვე), R9 (პატიოსანი ვერდიქტი), D3 (საკუთარი compute engine, Claude-ის გარეშე), ს1/ს2/ს4
**წინაპირობა:** ფაზები 1–3 სრულად (შემოსავალი/ხარჯი, ვალები, მიზნები)
**მზადაა, როცა:** გეგმა ერთი მოქმედებით იქმნება; Safe to spend, მთავარი მიზნების პროგრესი და თვის ვერდიქტი დაშბორდზეა.

---

## 1. მიმოხილვა

სისტემის ყველაზე ღირებულებრივი ფაზა. ყოველი თვის დასაწყისში (cron ან ღილაკი) სისტემა **საკუთარი ლოგიკით** აგენერირებს გეგმას ჩანჩქერის მიხედვით: სავალდებულო → ვალები → რეზერვი → მიზნები → თავისუფალი (= Safe to spend). თვის ბოლოს — დახურვის რიტუალი: გეგმა vs ფაქტი, ვერდიქტი (წინ/უკან), დასკვნები შემდეგი გეგმისთვის. დაშბორდი მთლიანად ამ ფაზაზე დგება.

## 2. Scope / Out of scope

**Scope:** plan engine (ჩანჩქერი + დეფიციტი + windfall), MonthlyPlan/MonthClose მოდელები, Safe to spend, დაშბორდის სრული გადაწყობა, სტაბილურობის ეტაპები (0–3), თვის ვერდიქტი, წმინდა პოზიციის ტრენდი, email დაიჯესტები, cron.
**Out of scope:** Claude-ის მონაწილეობა გეგმაში (D3 — engine დამოუკიდებელია; MCP ფაზა 5-ში მხოლოდ იკითხავს/შესთავაზებს).

## 3. მონაცემთა მოდელი (Prisma)

```prisma
enum PlanStatus {
  DRAFT      // გენერირებულია, დასადასტურებელი
  CONFIRMED  // მომხმარებელმა დაადასტურა — მოქმედი გეგმა
  CLOSED     // თვე დახურულია
}

enum AllocationKind {
  MANDATORY  // სავალდებულო ხარჯები (FIXED კატეგორიები + ფიქსირებული Expense-ები)
  DEBT       // ვალის გეგმიური შენატანი (refId = debtId)
  RESERVE    // სარეზერვო ფონდის შენატანი (refId = რეზერვის goalId)
  GOAL       // მიზნის შენატანი (refId = goalId)
  VARIABLE   // ცვლადი კატეგორიის ორიენტირი (refId = categoryId)
  FREE       // თავისუფალი ნაკადი = Safe to spend
}

model MonthlyPlan {
  id               String     @id @default(uuid()) @db.Uuid
  userId           String     @db.Uuid
  month            String     // "2026-09"
  status           PlanStatus @default(DRAFT)
  forecastIncome   Decimal    @db.Decimal(12, 2)
  forecastStable   Decimal    @db.Decimal(12, 2)
  forecastVariable Decimal    @db.Decimal(12, 2)
  actualIncome     Decimal?   @db.Decimal(12, 2) // ივსება თვის განმავლობაში
  safeToSpend      Decimal    @db.Decimal(12, 2) // თვის FREE
  currency         String     @default("GEL")
  confirmedAt      DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  allocations PlanAllocation[]
  close       MonthClose?

  @@unique([userId, month])
}

model PlanAllocation {
  id      String         @id @default(uuid()) @db.Uuid
  planId  String         @db.Uuid
  kind    AllocationKind
  refId   String?        @db.Uuid // debtId / goalId / categoryId
  label   String         // snapshot სახელი (რომ წაშლილმა entity-მ ისტორია არ გატეხოს)
  planned Decimal        @db.Decimal(12, 2)
  actual  Decimal?       @db.Decimal(12, 2) // ივსება დახურვისას

  plan MonthlyPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  @@index([planId, kind])
}

model MonthClose {
  id                 String   @id @default(uuid()) @db.Uuid
  planId             String   @db.Uuid @unique
  completionPct      Decimal  @db.Decimal(5, 2)  // გეგმის შესრულება %
  verdict            String   // "FORWARD" | "BACK" | "FLAT"
  netChange          Decimal  @db.Decimal(12, 2) // წმინდა პოზიციის ცვლილება
  plannedNetChange   Decimal  @db.Decimal(12, 2) // რას ითვალისწინებდა გეგმა
  debtPrincipalDelta Decimal  @db.Decimal(12, 2) // ვალის ძირის შემცირება (+)
  reserveDelta       Decimal  @db.Decimal(12, 2)
  goalsDelta         Decimal  @db.Decimal(12, 2)
  newDebt            Decimal  @db.Decimal(12, 2) // ახალი ვალი (−)
  withdrawals        Decimal  @db.Decimal(12, 2) // რეზერვიდან/მიზნებიდან გატანა (−)
  conclusions        Json     // [{type: 'raise_limit', categoryId, delta, note}] — შემდეგი გეგმა ითვალისწინებს
  closedAt           DateTime @default(now())

  plan MonthlyPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
}
```

`NotificationPreference`-ს ემატება: `windfallDebtPct Int @default(50)`, `windfallGoalsPct Int @default(30)`, `windfallFreePct Int @default(20)` (PRD §6, Q1 — პარამეტრებში იცვლება; ჯამი ვალიდაციით 100).

## 4. Engine-ები (სუფთა ფუნქციები — ამ ფაზის ბირთვი)

### 4.1 `lib/services/plan-engine.ts` — ჩანჩქერი

```typescript
type PlanInput = {
  forecast: IncomeForecast                       // ფაზა 1-ის engine-დან
  mandatoryFixed: { label: string; amount: number }[]        // ფიქსირებული Expense-ები
  variableTargets: { categoryId; label; amount }[]           // ცვლადი ორიენტირები (limit ან 3-თვიანი საშუალო)
  debtInstallments: { debtId; label; amount }[]              // მიმდინარე თვის გრაფიკის რიგები
  reserve: { goalId; monthlyContribution; remaining }        // რეზერვი — პრიორიტეტი #1 მიზნებში
  goals: { goalId; label; monthlyContribution; remaining; priority }[]
  conclusions: Conclusion[]                      // წინა თვის დახურვიდან
  daysInMonth: number
}

type PlanResult = {
  allocations: AllocationDraft[]                 // kind/refId/label/planned
  safeToSpendMonth: number
  safeToSpendDay: number
  deficit: DeficitInfo | null
}

export function generatePlan(input: PlanInput): PlanResult
```

წესები:
- განაწილების რიგი მკაცრია (§6): MANDATORY + VARIABLE ორიენტირები → DEBT → RESERVE → GOAL (პრიორიტეტით) → FREE.
- რეზერვი: სანამ სამიზნე არ შევსებულა, ის უსწრებს ყველა სხვა მიზანს; შენატანი = min(monthlyContribution, remaining).
- conclusions გამოიყენება: `raise_limit` ასწორებს შესაბამისი VARIABLE ორიენტირს.
- **დეფიციტი:** თუ შემოსავალი ჩანჩქერს ვერ ფარავს → `deficit`: რა არ ეტევა (რომელი საფეხურიდან) + ვარიანტები: დაბალპრიორიტეტიანი GOAL-ის პაუზა · GOAL შენატანის შემცირება · VARIABLE ორიენტირის შეკვეცა. **სისტემა თვითნებურად არაფერს ჭრის** — draft ინახება deficit ინფოთი და მომხმარებელი ირჩევს.

### 4.2 `lib/services/windfall.ts`

```typescript
// გეგმაზე მეტი შემოსავალი → შეთავაზება პროპორციით (default 50/30/20)
export function splitWindfall(excess: number, pcts: {debt: number; goals: number; free: number}): {
  toDebt: number; toGoals: number; toFree: number
}
```

### 4.3 `lib/services/verdict.ts` — თვის ვერდიქტი (R9: პატიოსანი)

```typescript
type VerdictInput = {
  debtPrincipalPaid: number   // ამ თვეში დაფარული ძირი (+)
  reserveNet: number          // რეზერვის შენატანები − გატანები
  goalsNet: number
  newDebtPrincipal: number    // ამ თვეში აღებული ახალი ვალი
}
export function calcVerdict(i: VerdictInput): {
  netChange: number   // debtPrincipalPaid + reserveNet + goalsNet − newDebtPrincipal
  verdict: 'FORWARD' | 'BACK' | 'FLAT'   // >0 / <0 / ===0 (±5₾ ზღურბლი დამრგვალებისთვის)
  components: { debt: number; reserve: number; goals: number; newDebt: number }
}
```

### 4.4 `lib/services/stability.ts` — ეტაპები და მთავარი მიზნები

```typescript
// ეტაპი 0: საწყისი ბუფერი 500₾ → 1: 1 თვის რეზერვი → 2: ვალის არქონა → 3: 3 თვის რეზერვი
export function currentStabilityStage(reserve: {saved; oneMonthTarget; threeMonthTarget}, totalDebtPrincipal: number): 0 | 1 | 2 | 3 | 4 // 4 = მიღწეული

export function debtFreeProjection(debts: {remainingPrincipal; monthlyPrincipalAvg}[]): {
  paidPct: number        // საწყისი ჯამური ძირიდან რამდენი %-ია დაფარული
  remaining: number
  projectedDate: Date | null  // მიმდინარე ტემპით
}
export function netPosition(reserves: number, goalSavings: number, totalDebtPrincipal: number): number
```

## 5. Server Actions — `lib/actions/plan-actions.ts`

- `generateMonthlyPlan(month?)` — აგროვებს input-ს (forecast, expenses, debts, goals, conclusions), უშვებს `generatePlan`-ს, ინახავს DRAFT-ს. Idempotent: არსებული DRAFT გადაეწერება, CONFIRMED — არა (error „ჯერ გახსენი რედაქტირება").
- `confirmPlan(planId, adjustments?)` — მომხმარებლის კორექტივები (მ.შ. დეფიციტის ვარიანტის არჩევა) → CONFIRMED. **ერთი მოქმედება — G1: ≤1 წუთი.**
- `getActivePlan()` — მიმდინარე თვის გეგმა + ლაივ ფაქტები: დახარჯული FREE-დან, დარჩენილი Safe to spend თვეზე/დღეზე (დარჩენილი დღეებით გაყოფილი).
- `handleWindfall(planId)` — actualIncome > forecast → `splitWindfall` შეთავაზება; მომხმარებელი ადასტურებს/ცვლის → allocations განახლდება (ს2).
- `closeMonth(planId, decisions)` — ითვლის actual-ებს ledger-იდან, completionPct, ვერდიქტს; მომხმარებელი ადასტურებს შემოთავაზებულ conclusions-ს (მაგ. „კვების ორიენტირი +50₾") → MonthClose ინახება, სტატუსი CLOSED (ს4).
- `getDashboardData()` — დაშბორდის მთელი ViewModel ერთ query-ბლოკად (ქვემოთ §6.1).
- `getStabilityProgress()` — ეტაპი, მთავარი მიზნების პროგრესი, ვერდიქტების ისტორია, net position ტრენდი 6 თვე.

## 6. UI / ეკრანები

### 6.1 დაშბორდი — სრული გადაწყობა (`/dashboard`, §7.7 ზუსტად)

ზემოდან ქვემოთ:

1. **Safe to spend** — ყველაზე დიდი რიცხვი ეკრანზე: „უსაფრთხოდ შეგიძლია დახარჯო: **27₾ დღეში**" + თვის ნაშთი (320₾ / 750₾). გეგმა არ არსებობს → CTA „შექმენი სექტემბრის გეგმა".
2. **ამ თვის პროგრესი** — გეგმის შესრულების ბარი % + ვერდიქტის ლაივ-პრევიუ: „წინ +410₾" (მწვანე) / „უკან −N₾" (წითელი) კომპონენტების tooltip-ით.
3. **მთავარი მიზნები** (ორი ბარათი, ვერ იშლება):
   - **ვალის არქონა:** დაფარულია XX%, დარჩა Y₾, პროგნოზი — [თვე/წელი]. წინსწრებით დაფარვისას თარიღი თვალწინ უახლოვდება.
   - **3-თვიანი რეზერვი:** შევსებულია XX%, მიღწევის პროგნოზი.
   - ზემოთ — **სტაბილურობის გზა:** ეტაპები 0→1→2→3 stepper-ად, მიმდინარე გამოკვეთილი.
4. **ვალები** — ჯამური დარჩენილი ძირი + უახლოესი შენატანი (თარიღი, თანხა) → ბმული /debts.
5. **სხვა მიზნები** — კომპაქტური სია პროგრესით და სტატუსით (გრაფიკშია/ჩამორჩება) → /goals.
6. **წმინდა პოზიცია** — რიცხვი (დანაზოგები − ვალები) + 6-თვიანი ხაზოვანი ტრენდი (Recharts) — R7.

ყველა თანხა default ვალუტაში; sourcemark tooltip-ით ორიგინალი ვალუტა.

### 6.2 `/plan` — თვიური გეგმა
- **DRAFT ხედი (ს1):** შემოსავლის პროგნოზი დაშლით („3,500 სტაბილური + 1,300 კონსერვატიული — საიდან მოდის ეს რიცხვი" ბმულით), განაწილების ცხრილი ჩანჩქერის რიგით (სექციები: სავალდებულო / ვალები / რეზერვი / მიზნები / **თავისუფალი**), თითო ხაზი inline-რედაქტირებადი. ბოლოში დიდი ღილაკი **„დადასტურება"**.
- **დეფიციტის ხედი:** წითელი ბლოკი „−180₾ არ ეტევა: [მიზანი X]" + ვარიანტების radio: პაუზა / შემცირება / ორიენტირის შეკვეცა → არჩევა → დადასტურება.
- **CONFIRMED ხედი:** planned vs actual ლაივში თითო ხაზზე, windfall ბანერი როცა actualIncome > forecast: „ჭარბი 300₾ — შეთავაზება: 150 ვალს · 90 მიზნებს · 60 თავისუფალს [დადასტურება] [შეცვლა]".
- **დახურვის ხედი (თვის ბოლოს, ს4):** გეგმა vs ფაქტი თითო ხაზზე გადახრებით (±%), შემოთავაზებული დასკვნები checkbox-ებით („კვების ორიენტირი +50₾ — ზედიზედ მე-3 თვეა გეგმაზე მეტი"), ვერდიქტის ბარათი დაშლით: ვალის ძირი −180 · რეზერვი +150 · მიზნები +80 → **ჯამში +410₾ წინ**; „გეგმა ითვალისწინებდა +M₾, ფაქტი +N₾". ღილაკი „თვის დახურვა" — 10 წუთის რიტუალი (R4).
- **ისტორია:** დახურული თვეების სია ვერდიქტებით.

### 6.3 მომხმარებლის ფლოუები
1. **ს1:** 1 რიცხვში cron → email „სექტემბრის გეგმა მზადაა" → /plan → გადახედვა → „დადასტურება" (≤1 წუთი).
2. **ს2:** შემოსავლის დაფიქსირება 900₾ (გეგმაში 600) → /plan-ზე windfall ბანერი → დადასტურება → allocations +150 ვალი, +90 მიზნები, Safe to spend +60.
3. **ს4:** თვის ბოლო კვირას email „დახურვის დროა" → დახურვის ხედი → დასკვნების მონიშვნა → დახურვა → ვერდიქტი დაშბორდზე; conclusions შემდეგი გეგმის გენერაციაში აისახება.
4. **დეფიციტი:** პროგნოზი შემცირდა → draft deficit-ით → მომხმარებელი ირჩევს „ტექნიკის მიზნის პაუზა" → გეგმა ბალანსდება.

## 7. Cron და შეტყობინებები

`/api/cron/send-notifications` გაფართოება (ან ახალი `/api/cron/monthly-plan`):
- თვის 1 რიცხვი: ყველა მომხმარებელზე `generateMonthlyPlan` → **სრული დაიჯესტ-email** „გეგმა მზადაა" (განაწილება + Safe to spend + ბმული დასადასტურებლად).
- თვის ბოლო დღეს (ან ბოლო კვირას): „თვის დახურვის დროა" email.
- დახურვის შემდეგ: **შეჯამების დაიჯესტი** — გეგმა vs ფაქტი, ვერდიქტი, ეტაპის სტატუსი.
- ვერდიქტი BACK → email მიზეზის მოკლე ახსნით (მშრალად, R9); ეტაპის მიღწევა → milestone email (ხმამაღლა).

## 8. ტესტირება (Definition of Done-ის ნაწილი)

**Unit — `plan-engine.test.ts` (სრული დაფარვა):**
- ჩანჩქერის რიგი: საკმარისი შემოსავლისას ყველა საფეხური ივსება, FREE = ნაშთი; ჯამი === forecast ზუსტად (ცენტამდე).
- რეზერვი უსწრებს მიზნებს; შევსებული რეზერვი (remaining 0) → 0 allocation, რიგი მიზნებზე გადადის.
- დეფიციტი: GOAL საფეხურზე წყდება → deficit სწორი საფეხურით/თანხით; MANDATORY-საც ვერ ფარავს → deficit მთელი ჩანჩქერით, FREE = 0 (არა უარყოფითი).
- conclusions: raise_limit ცვლის VARIABLE ორიენტირს შემდეგ გენერაციაში.
- safeToSpendDay = FREE / daysInMonth, დამრგვალება ქვევით.
- მიზნის შენატანი capped remaining-ზე (ბოლო თვე ნაწილობრივი).

**Unit — `windfall.test.ts`:** 300₾ @ 50/30/20 → 150/90/60; დამრგვალების ნაშთი free-ს ემატება; პროპორციის ჯამი ≠100 → error.

**Unit — `verdict.test.ts` (R9 სცენარები):**
- ყველა კომპონენტი დადებითი → FORWARD, netChange სწორი.
- გეგმა შესრულებულია, მაგრამ რეზერვიდან გატანა > შენატანები → BACK (პატიოსნების ტესტი).
- ახალი ვალი აჭარბებს დაფარულს → BACK.
- ±5₾ ფარგლებში → FLAT.

**Unit — `stability.test.ts`:** ეტაპების ზღვრები (ბუფერი 500₾ / 1 თვე / ვალი 0 / 3 თვე); debtFreeProjection: ტემპი 0 → projectedDate null; netPosition უარყოფითიც სწორად.

**Integration — actions:**
- `generateMonthlyPlan`: idempotent DRAFT; CONFIRMED-ზე ხელახლა → error; conclusions წინა დახურვიდან იკითხება.
- `closeMonth`: actual-ები ledger-იდან სწორად აგრეგირდება; MonthClose + CLOSED ატომურად; დახურულ თვეზე ხელახლა → error.
- `handleWindfall`: allocations დელტები ზუსტად შეესაბამება split-ს.
- `getActivePlan`: Safe to spend/დღეში ითვლის დარჩენილი დღეებით და უკვე დახარჯულით.

**Component:**
- დაშბორდის Safe to spend ბლოკი: გეგმით / გეგმის გარეშე (CTA) რენდერი.
- ვერდიქტის ბარათი: FORWARD/BACK/FLAT სამივე ვიზუალი.
- დეფიციტის radio-ფლოუ: არჩევის გარეშე დადასტურება დაბლოკილია.
- stepper: 4 ეტაპის მდგომარეობები.

**E2E-სტილის integration (მთლიანი ციკლი, ტესტ-DB):**
- სრული თვე: გენერაცია → დადასტურება → ხარჯები/შემოსავალი/ვალის გადახდა → windfall → დახურვა → ვერდიქტი → შემდეგი თვის გენერაცია conclusions-ით. ეს ტესტი ფაზის მთავარი მიმღები ტესტია.

## 9. იმპლემენტაციის ეტაპები

| # | ეტაპი | შედეგი |
|---|---|---|
| 4.1 | Prisma მოდელები + მიგრაცია + windfall პარამეტრები | ტიპები გენერირებული |
| 4.2 | plan-engine + windfall + verdict + stability + სრული unit ტესტები | engine-ები მწვანე (ფაზის ნახევარი შრომა აქაა) |
| 4.3 | plan-actions + ტესტები | გენერაცია/დადასტურება/windfall/დახურვა |
| 4.4 | `/plan` გვერდი (4 ხედი) + კომპონენტ-ტესტები | ს1/ს2/ს4 ფლოუები |
| 4.5 | დაშბორდის გადაწყობა + კომპონენტ-ტესტები | §6.1 სრულად |
| 4.6 | Cron + email დაიჯესტები + ტესტები | თვის რიტმი ავტომატურია |
| 4.7 | სრული ციკლის integration ტესტი + `npm run build` მწვანე; README სტატუსი | ფაზა დახურულია |
