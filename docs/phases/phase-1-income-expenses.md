# ფაზა 1 — შემოსავალი და ხარჯი

**PRD:** §7.1 (შემოსავლები), §7.2 (ხარჯები), R2 (კონსერვატიული პროგნოზი), R5 (კატეგორიების მინიმალიზმი), R6 (ტრანზაქციის ერთიანი ცნება)
**მზადაა, როცა:** მომდევნო თვის შემოსავლის პროგნოზი ჩანს; ხარჯები კატეგორიზებულია; ტესტ-ინფრასტრუქტურა მუშაობს.

---

## 1. მიმოხილვა

ეს ფაზა სამ საძირკველს დებს:

1. **ტესტ-ინფრასტრუქტურა** — Vitest + React Testing Library. აქამდე პროექტში ტესტები საერთოდ არ არის; ფინანსური ლოგიკის დაწყებამდე ეს სავალდებულოა.
2. **ერთიანი ტრანზაქციის მოდელი** — ყველა ფულადი მოძრაობა ერთი ცნებაა `entrySource` ველით. ეს დღესვე იდება, რომ ფაზა 5/6-მა ლოგიკა არ შეცვალოს.
3. **შემოსავლების აღრიცხვა + კონსერვატიული პროგნოზი** და **ცვლადი ხარჯების ორიენტირები** — ის მონაცემები, რომელზეც ფაზა 4-ის თვიური გეგმა დგება.

არსებული `Expense`/`Payment` მოდელები (განმეორებადი გადასახდელები — ბინა, გამოწერები) **უცვლელი რჩება** — ისინი PRD-ის „ფიქსირებული ხარჯის" როლს ასრულებენ. ახალი `Transaction` მოდელი ცვლადი ხარჯებisა და შემოსავლების ledger-ია; ფიქსირებული გადახდის დაფიქსირებისას (`markPaid`) ავტომატურად იქმნება შესაბამისი `Transaction` ჩანაწერიც, რომ ledger-ში სრული სურათი იყოს.

## 2. Scope / Out of scope

**Scope:**
- Vitest სეტაპი + `npm run test` / `test:watch` სკრიპტები + CI-ში ჩართვა (თუ CI არსებობს).
- Prisma: `Transaction`, `IncomeSource` მოდელები; `Category`-ს გაფართოება (`monthlyLimit`, `kind`).
- შემოსავლის წყაროების CRUD + ფაქტების ჩაწერა + პროგნოზის engine.
- ცვლადი ხარჯის სწრაფი ჩაწერა (quick-add) + ორიენტირის (რბილი ლიმიტის) თვალყური.
- გვერდები: `/income` (ახალი), `/expenses` (გაფართოება), quick-add ყველგან ხელმისაწვდომი.
- Email გაფრთხილება ორიენტირის 80%/100%-ზე.

**Out of scope (მომდევნო ფაზები):** ვალები, მიზნები, თვიური გეგმა, Safe to spend, MCP, იმპორტი.

## 3. მონაცემთა მოდელი (Prisma)

```prisma
enum TransactionType {
  INCOME
  EXPENSE
}

enum EntrySource {
  MANUAL
  CLAUDE
  IMPORT
  BANK
}

enum IncomeType {
  STABLE    // ხელფასი — ფიქსირებული თანხა და თარიღი
  VARIABLE  // პროექტები, ერთჯერადი
}

model Transaction {
  id             String          @id @default(uuid()) @db.Uuid
  userId         String          @db.Uuid
  type           TransactionType
  amount         Decimal         @db.Decimal(12, 2)
  currency       String          @default("GEL")
  date           DateTime        // როდის მოხდა რეალურად
  categoryId     String?         @db.Uuid   // EXPENSE-სთვის
  incomeSourceId String?         @db.Uuid   // INCOME-სთვის
  expenseId      String?         @db.Uuid   // ბმა ფიქსირებულ Expense-ზე, თუ markPaid-დან შეიქმნა
  description    String?
  entrySource    EntrySource     @default(MANUAL)
  externalId     String?         // ბანკის ტრანზაქციის ID — ფაზა 6-ის დედუპლიკაციისთვის; ახლა null
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  category     Category?     @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  incomeSource IncomeSource? @relation(fields: [incomeSourceId], references: [id], onDelete: SetNull)

  @@index([userId, date])
  @@index([userId, type, date])
  @@unique([userId, externalId])   // დედუპლიკაცია ფაზა 6-ში
}

model IncomeSource {
  id             String     @id @default(uuid()) @db.Uuid
  userId         String     @db.Uuid
  name           String     // "ხელფასი", "Freelance — X"
  type           IncomeType
  expectedAmount Decimal?   @db.Decimal(12, 2) // STABLE-სთვის სავალდებულო
  currency       String     @default("GEL")
  expectedDay    Int?       // თვის რიცხვი, STABLE-სთვის
  isActive       Boolean    @default(true)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]

  @@index([userId])
}
```

`Category` გაფართოება:

```prisma
model Category {
  // ...არსებული ველები...
  kind         String   @default("VARIABLE") // "FIXED" | "VARIABLE"
  monthlyLimit Decimal? @db.Decimal(12, 2)   // რბილი ორიენტირი; null = ლიმიტი არ არის
}
```

`User`-ს ემატება რელაციები: `transactions Transaction[]`, `incomeSources IncomeSource[]`.

**კატეგორიების seed (R5 — 5–8 საკმარისია):** კვება · ტრანსპორტი · ბინა/კომუნალური (FIXED) · გამოწერები (FIXED) · ჯანმრთელობა · გართობა · სხვა. Seed მხოლოდ ახალ მომხმარებელს; არსებული კატეგორიები არ ითიშება.

## 4. Engine-ები (სუფთა ფუნქციები)

### 4.1 `lib/services/income-forecast.ts`

```typescript
type ForecastInput = {
  stableSources: { expectedAmount: number; currency: string }[]
  variableHistory: { month: string; total: number }[] // ბოლო 3–6 თვე, default ვალუტაში
  conservativeFactor?: number // default 0.75 (R2: საშუალოს 70–80%)
}

type IncomeForecast = {
  stableTotal: number
  variableEstimate: number    // min(avg × factor, historicalMin) — R2
  total: number
  method: 'average_discounted' | 'historical_min' | 'no_history'
  monthsOfHistory: number
}

export function forecastNextMonthIncome(input: ForecastInput): IncomeForecast
```

წესები:
- ისტორია < 3 თვე → `variableEstimate = 0`, `method: 'no_history'` (UI-ში ახსნით: „ჯერ ისტორია გროვდება").
- ისტორია ≥ 3 თვე → `min(საშუალო × 0.75, პერიოდის მინიმუმი)` — ორივე კონსერვატიული ვარიანტიდან უფრო დაბალი.
- თვე, სადაც არასტაბილური შემოსავალი 0 იყო, ისტორიაში **ითვლება** (0-ად) — ეს პესიმიზმის ნაწილია.

### 4.2 `lib/services/category-spend.ts`

```typescript
type CategorySpendStatus = {
  categoryId: string
  spent: number          // მიმდინარე თვეში, default ვალუტაში
  limit: number | null
  ratio: number | null   // spent / limit
  level: 'ok' | 'warning' | 'over' // ≥0.8 → warning, >1.0 → over
}

export function getCategorySpendStatus(spentByCategory, categories): CategorySpendStatus[]
```

## 5. Server Actions

`lib/actions/income-actions.ts`:
- `createIncomeSource / updateIncomeSource / archiveIncomeSource`
- `recordIncome(input)` — ქმნის `Transaction {type: INCOME}`; აბრუნებს განახლებულ თვის ჯამს.
- `getIncomeOverview()` — წყაროები + მიმდინარე თვის ფაქტები + `forecastNextMonthIncome` შედეგი.

`lib/actions/transaction-actions.ts`:
- `quickAddExpense(input)` — ცვლადი ხარჯის 10-წამიანი ჩაწერა: თანხა + კატეგორია (+ სურვილით აღწერა/თარიღი). აბრუნებს კატეგორიის განახლებულ `CategorySpendStatus`-ს, რომ UI-მ მაშინვე აჩვენოს გაფრთხილება.
- `getTransactions(filters)` — ტიპით/კატეგორიით/პერიოდით ფილტრაცია, პაგინაცია.
- `updateTransaction / deleteTransaction`.

`lib/actions/category-actions.ts` (გაფართოება):
- `setCategoryLimit(categoryId, limit | null)`
- `getCategoriesWithSpend()` — კატეგორიები + მიმდინარე თვის სტატუსი.

არსებული `markPaymentPaid` (ან ეკვივალენტი expense-actions-ში) გაფართოვდეს: წარმატებული markPaid → `Transaction {type: EXPENSE, expenseId, entrySource: MANUAL}` ჩანაწერი ტრანზაქციულად (Prisma `$transaction`).

## 6. UI / ეკრანები

### 6.1 `/income` — ახალი გვერდი
- **პროგნოზის ბარათი (თავში):** „მომდევნო თვის პროგნოზი: N₾" + დაშლა: სტაბილური X + არასტაბილური Y (მეთოდის ახსნით: „ბოლო N თვის კონსერვატიული შეფასება"). ეს ბარათი ფაზა 4-ში დაშბორდზეც გამოჩნდება.
- **წყაროების სია:** ბარათები (სახელი, ტიპი badge, მოსალოდნელი თანხა/დღე, აქტიური toggle) + დამატება/რედაქტირება dialog.
- **ფაქტების სია:** მიმდინარე თვის მიღებული შემოსავლები; „შემოსავლის დაფიქსირება" ღილაკი → dialog (წყარო, თანხა, ვალუტა, თარიღი).
- Empty state: ონბორდინგი — „დაამატე პირველი წყარო (ხელფასი)".

### 6.2 Quick-add ხარჯი (გლობალური)
- Header-ში „+" ღილაკი (mobile: FAB) → dialog: თანხა (autofocus, numeric keyboard), კატეგორიის chips (ბოლოს გამოყენებული პირველი), სურვილით აღწერა. Enter → შენახვა → toast.
- შენახვის შემდეგ თუ კატეგორია `warning`/`over` გახდა → toast-შივე: „კვება: 420/500₾ — ორიენტირის 84%".
- Optimistic update Zustand-ით (არსებული პატერნი).

### 6.3 `/expenses` გაფართოება
- ტაბები: **ფიქსირებული** (არსებული Expense სია, უცვლელი) · **ცვლადი** (Transaction-ების სია ფილტრებით) · **კატეგორიები**.
- კატეგორიების ტაბი: თითო კატეგორიაზე პროგრეს-ბარი `spent/limit`, ფერი level-ის მიხედვით (ok/warning/over), ლიმიტის inline რედაქტირება.

### 6.4 მომხმარებლის ფლოუები
1. **ონბორდინგი:** /income ცარიელია → ამატებს „ხელფასი, STABLE, 3500₾, 5 რიცხვი" → პროგნოზის ბარათი მაშინვე აჩვენებს 3500₾-ს (`no_history` არასტაბილურზე).
2. **ყოველდღიური ჩაწერა (≤30 წმ):** ნებისმიერ გვერდზე „+" → 18₾, „კვება" → Enter. Toast + ლიმიტის სტატუსი.
3. **შემოსავალი შემოვიდა:** /income → „დაფიქსირება" → Freelance, 900₾ → თვის ჯამი განახლდა. (Windfall ლოგიკა — ფაზა 4.)
4. **ორიენტირის გადაჭარბება:** კვება 505/500₾ → ბარი წითელი, email „კვების ორიენტირი ამოიწურა (101%)".

## 7. შეტყობინებები
- ორიენტირის 80% და 100% — თითო ზღვარზე მაქსიმუმ 1 email თვეში თითო კატეგორიაზე (სპამის თავიდან ასაცილებლად; მდგომარეობა `Notification.metadata`-ში). იგზავნება არსებული notification-service-ის გავლით (in-app + email).

## 8. ტესტ-ინფრასტრუქტურის სეტაპი (ეტაპი 0 — ყველაფრამდე)

1. `npm i -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom vite-tsconfig-paths`
2. `vitest.config.ts`: `environment: 'jsdom'`, `@/` alias (vite-tsconfig-paths), setup ფაილი jest-dom-ისთვის.
3. `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.
4. კონვენცია: ტესტი ფაილის გვერდით — `lib/services/income-forecast.test.ts`; კომპონენტის ტესტი `component-name.test.tsx`.
5. Smoke ტესტი (მაგ. არსებული `lib/utils/`-დან ერთი ფუნქციის ტესტი), რომ pipeline მუშაობს.
6. CLAUDE.md-ის Testing წესი უკვე ძალაშია ამ მომენტიდან.

## 9. ტესტირება (Definition of Done-ის ნაწილი)

**Unit — `income-forecast.test.ts`:**
- სტაბილური ჯამი მრავალი წყაროდან; არააქტიური წყარო არ ითვლება.
- ისტორია 0/1/2 თვე → estimate 0, method `no_history`.
- ისტორია [1000, 1200, 800] → `min(1000×0.75, 800) = 750`.
- ისტორია [1000, 0, 1200] → მინიმუმი 0 → estimate 0 (ნულოვანი თვე ითვლება).
- Factor-ის საზღვრები (0.7/0.8) და default 0.75.

**Unit — `category-spend.test.ts`:**
- limit null → level `ok`, ratio null.
- ზუსტად 80% → `warning`; 100% → `warning`; 100.01% → `over`.
- მრავალვალუტიანი ხარჯების დაჯამება default ვალუტაში (currency service-ის mock-ით).

**Integration (Prisma mock ან ტესტ-DB) — actions:**
- `quickAddExpense`: unauthorized → error; ვალიდური input → Transaction იქმნება, status ბრუნდება; უარყოფითი/ნულოვანი თანხა → error.
- `recordIncome`: Transaction {INCOME} იქმნება სწორი წყარით.
- `markPaymentPaid`: Payment.paid + Transaction ორივე იქმნება ერთ `$transaction`-ში; წარუმატებლობისას არცერთი.

**Component:**
- Quick-add dialog: შეყვანა → submit → callback სწორი მონაცემებით; ვალიდაცია (ცარიელი თანხა).
- კატეგორიის პროგრეს-ბარი: სამი level-ის რენდერი.

## 10. იმპლემენტაციის ეტაპები

| # | ეტაპი | შედეგი |
|---|---|---|
| 1.0 | ტესტ-სეტაპი (§8) | `npm run test` მუშაობს, smoke ტესტი მწვანეა |
| 1.1 | Prisma მოდელები + მიგრაცია + seed კატეგორიები | `npm run db:migrate:dev` წარმატებით; ტიპები გენერირებულია |
| 1.2 | Engine-ები + მათი unit ტესტები | forecast/spend ტესტები მწვანე |
| 1.3 | Server Actions + ტესტები | ყველა action ტესტით დაფარული |
| 1.4 | `/income` გვერდი + quick-add + `/expenses` ტაბები + კომპონენტ-ტესტები | ფლოუები §6.4 მუშაობს |
| 1.5 | Email გაფრთხილებები + ტესტი (email service mock) | 80%/100% წერილები |
| 1.6 | `npm run build` + `npm run test` სრულად მწვანე; README სტატუსის განახლება | ფაზა დახურულია |
