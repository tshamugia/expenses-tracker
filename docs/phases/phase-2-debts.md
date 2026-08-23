# ფაზა 2 — ვალები: სრული ამორტიზაცია + სიმულატორი

**PRD:** §7.3 (ვალები), D1 (ანუიტეტური ფორმულა), ს5 (წინსწრებითი დაფარვის სცენარი), R1 (ჯერ მინი-რეზერვი)
**წინაპირობა:** ფაზა 1 (Transaction მოდელი, ტესტ-ინფრასტრუქტურა)
**მზადაა, როცა:** ყველა ვალზე ჩანს სრული გრაფიკი, დარჩენილი ძირი და დასრულების ზუსტი თარიღი; სიმულატორი ორ რიცხვში პასუხობს.

---

## 1. მიმოხილვა

ვალის დამატებისას (თანხა, წლიური %, ვადა **ან** თვიური შენატანი) სისტემა აგებს სრულ ანუიტეტურ გრაფიკს: ყოველი შენატანი დაშლილია პროცენტად და ძირად, ჩანს დარჩენილი ძირი ყოველი თვის ბოლოს, ჯამური პროცენტი და დასრულების თარიღი. გადახდის დაფიქსირება გრაფიკის რიგს ასრულებს და ledger-ში `Transaction`-ს ქმნის. სიმულატორი პასუხობს: „+X₾/თვე ან ერთჯერადი Y₾ → N თვით ადრე დასრულება, Z₾ დაზოგილი პროცენტი".

## 2. Scope / Out of scope

**Scope:** Debt CRUD, ამორტიზაციის engine, გრაფიკის შენახვა/გადათვლა, გადახდის დაფიქსირება (მათ შორის წინსწრებითი), სიმულატორი, avalanche/snowball შედარება, `/debts` გვერდები, შენატანის შეხსენების email.
**Out of scope:** ვალის ჩართვა თვიურ გეგმაში და „ვალის არქონის" პროგრეს-თრექინგი (ფაზა 4); ცვლადი განაკვეთის სესხები; საკრედიტო ბარათის რევოლვერული ვალი (ღია კითხვად რჩება — ამ ვერსიაში ანუიტეტი საკმარისია).

## 3. მონაცემთა მოდელი (Prisma)

```prisma
enum DebtStatus {
  ACTIVE
  PAID_OFF
  ARCHIVED
}

model Debt {
  id              String     @id @default(uuid()) @db.Uuid
  userId          String     @db.Uuid
  name            String     // "სამომხმარებლო სესხი — TBC"
  principal       Decimal    @db.Decimal(12, 2)  // საწყისი ძირი
  annualRatePct   Decimal    @db.Decimal(6, 3)   // წლიური % (მაგ. 18.500)
  termMonths      Int                              // ვადა თვეებში (გამოთვლილი, თუ შენატანი იყო input)
  monthlyPayment  Decimal    @db.Decimal(12, 2)  // ანუიტეტური შენატანი (გამოთვლილი, თუ ვადა იყო input)
  currency        String     @default("GEL")
  firstPaymentDate DateTime  // პირველი შენატანის თარიღი; დანარჩენები ყოველთვიურად იმავე რიცხვში
  status          DebtStatus @default(ACTIVE)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  user     User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  schedule DebtScheduleItem[]

  @@index([userId, status])
}

model DebtScheduleItem {
  id                 String    @id @default(uuid()) @db.Uuid
  debtId             String    @db.Uuid
  seq                Int       // 1..termMonths
  dueDate            DateTime
  payment            Decimal   @db.Decimal(12, 2)
  interestPart       Decimal   @db.Decimal(12, 2)
  principalPart      Decimal   @db.Decimal(12, 2)
  remainingPrincipal Decimal   @db.Decimal(12, 2) // ამ შენატანის შემდეგ
  paid               Boolean   @default(false)
  paidAt             DateTime?
  paidAmount         Decimal?  @db.Decimal(12, 2) // ფაქტობრივი (წინსწრებითისას ≠ payment)
  transactionId      String?   @db.Uuid           // ბმა ledger-ზე

  debt Debt @relation(fields: [debtId], references: [id], onDelete: Cascade)

  @@unique([debtId, seq])
  @@index([debtId, paid, dueDate])
}
```

**გრაფიკის შენახვის წესი:** გრაფიკი გენერაციისას ინახება (და არა on-the-fly ითვლება), რომ გადახდილი ისტორია უცვლელი დარჩეს. **წინსწრებითი დაფარვისას** გადაუხდელი ნაწილი იშლება და თავიდან გენერირდება ახალი დარჩენილი ძირიდან (შენატანი უცვლელი, ვადა მოკლდება — ნაგულისხმევი ქცევა).

## 4. Engine — `lib/services/amortization.ts` (სუფთა ფუნქციები)

```typescript
// ანუიტეტის ფორმულა: A = P · r/(1 − (1+r)^−n),  r = annualRatePct/100/12
export function calcAnnuityPayment(principal, annualRatePct, termMonths): number
export function calcTermMonths(principal, annualRatePct, monthlyPayment): number // + ვალიდაცია: შენატანი > პირველი თვის პროცენტი

export type ScheduleRow = {
  seq: number; dueDate: Date; payment: number
  interestPart: number; principalPart: number; remainingPrincipal: number
}
export function buildSchedule(input: {
  principal: number; annualRatePct: number; termMonths: number
  firstPaymentDate: Date
}): ScheduleRow[]
// უკანასკნელი რიგი ასწორებს დამრგვალების ნაშთს ისე, რომ remainingPrincipal ზუსტად 0 იყოს

export type PrepaymentSimResult = {
  monthsSaved: number
  interestSaved: number
  newEndDate: Date
  newSchedule: ScheduleRow[]
}
export function simulateExtraMonthly(current: ScheduleRow[], fromSeq: number, extra: number, rate: number): PrepaymentSimResult
export function simulateLumpSum(current: ScheduleRow[], atSeq: number, amount: number, rate: number): PrepaymentSimResult

// მრავალი ვალის სტრატეგია დამატებითი თანხისთვის
export function rankDebtsForExtra(debts, strategy: 'avalanche' | 'snowball'): Debt[]
// avalanche: მაღალი % ჯერ (ნაგულისხმევი — მათემატიკურად იაფი); snowball: პატარა ბალანსი ჯერ
```

ყველა თანხა engine-ში `number`-ია, დამრგვალება — 2 ნიშნამდე ყოველ საფეხურზე (ბანკის სტანდარტი: round half up).

## 5. Server Actions — `lib/actions/debt-actions.ts`

- `createDebt(input)` — input: name, principal, rate, currency, firstPaymentDate + (`termMonths` **ან** `monthlyPayment`). ითვლის მეორეს, აგენერირებს გრაფიკს, ინახავს Debt + Schedule ერთ `$transaction`-ში.
- `getDebts()` — სია + აგრეგატები: ჯამური დარჩენილი ძირი (default ვალუტაში), უახლოესი შენატანი.
- `getDebtDetail(id)` — Debt + სრული გრაფიკი + summary (გადახდილი/დარჩენილი პროცენტი, პროგრესი %).
- `recordDebtPayment(scheduleItemId, { paidAt, amount? })` — რიგი paid; `Transaction {EXPENSE}` ledger-ში; თუ ვალის ბოლო რიგია → Debt → `PAID_OFF` + notification „ვალი დახურულია 🎉".
- `applyPrepayment(debtId, { type: 'extra_monthly' | 'lump_sum', amount })` — სიმულაცია → დადასტურებული შედეგით გრაფიკის regeneration (ძველი გადაუხდელი რიგები იშლება); lump_sum-ისას `Transaction` იქმნება.
- `simulatePrepayment(debtId, input)` — მხოლოდ კითხვა, არაფერს ცვლის. ამ action-ს ფაზა 5-ში MCP tool-იც გამოიყენებს.
- `updateDebt / archiveDebt` — რედაქტირება მხოლოდ სახელის/თარიღის დონეზე; პარამეტრების (%, თანხა) შეცვლა = გადაუხდელი გრაფიკის regeneration გაფრთხილებით.

## 6. UI / ეკრანები

### 6.1 `/debts` — სია
- Summary ბარათი: ჯამური დარჩენილი ძირი, ჯამური თვიური შენატანი, უახლოესი გადახდა (თარიღი + თანხა).
- ვალის ბარათი: სახელი, პროგრეს-ბარი (დაფარული ძირი %), დარჩენილი ძირი, შენატანი, დასრულების თარიღი, გადაუხდელი/დაგვიანებული badge (წითელი, თუ dueDate < დღეს და !paid).
- ≥2 ვალზე: სტრატეგიის ბლოკი — „დამატებითი თანხა ჯერ: [ვალის სახელი]" avalanche/snowball toggle-ით და ერთწინადადებიანი ახსნით.

### 6.2 `/debts/[id]` — დეტალი
- Header: სახელი, სტატუსი, პროგრესი (დაფარული ძირი / საწყისი), დასრულების თარიღი.
- Summary რიცხვები: დარჩენილი ძირი · გადახდილი პროცენტი · დარჩენილი პროცენტი · ჯამში გადასახდელი.
- **გრაფიკის ცხრილი:** # · თარიღი · შენატანი · პროცენტი · ძირი · ნაშთი · სტატუსი (✓ / მომავალი / დაგვიანებული). მიმდინარე რიგი გამოკვეთილი. მობილურზე — ბარათებად.
- Stacked bar ჩარტი (Recharts): თითო თვე პროცენტი vs ძირი — ვიზუალურად ჩანს, როგორ იცვლება პროპორცია.
- „გადახდის დაფიქსირება" ღილაკი მიმდინარე რიგზე.

### 6.3 სიმულატორი (dialog `/debts/[id]`-ზე)
- ორი ტაბი: „+X₾ ყოველთვიურად" / „ერთჯერადი Y₾".
- Input + ლაივ შედეგი ორ დიდ რიცხვში: **„N თვით ადრე"** და **„Z₾ დაზოგილი პროცენტი"** + ახალი დასრულების თარიღი.
- ღილაკი „გატარება" → დადასტურების dialog (ძველი/ახალი გრაფიკის შედარება) → `applyPrepayment`.

### 6.4 მომხმარებლის ფლოუები
1. **ვალის დამატება:** /debts → „დამატება" → 5000₾, 18%, 24 თვე → preview (შენატანი 249.62₾, ჯამური პროცენტი 990.94₾, ბოლო თარიღი) → შენახვა → დეტალის გვერდი სრული გრაფიკით.
2. **ყოველთვიური გადახდა:** email შეხსენება (dueDate − notifyBeforeDays) → აპში „დაფიქსირება" → რიგი მწვანე, დარჩენილი ძირი განახლდა, ledger-ში ჩანაწერი.
3. **ს5 — ბონუსი 2000₾:** სიმულატორში lump_sum 2000 → „5 თვით ადრე, 340₾ დაზოგილი" → გატარება → გრაფიკი გადათვლილია, დასრულების თარიღი მიახლოვდა.
4. **დაგვიანება:** dueDate გავიდა → რიგი წითელი, in-app + email „შენატანი გადაცილებულია".

## 7. შეტყობინებები
- შენატანამდე N დღით ადრე (არსებული `notifyBeforeDays`) — email + in-app.
- გადაცილებული შენატანი — მეორე დღეს, ერთხელ.
- ვალი სრულად დაიხურა — milestone email.
- ინტეგრაცია არსებულ cron endpoint-ში (`/api/cron/send-notifications`).

## 8. ტესტირება (Definition of Done-ის ნაწილი)

**Unit — `amortization.test.ts` (ამ ფაზის ბირთვი, სრული დაფარვა):**
- `calcAnnuityPayment(5000, 18, 24)` → 249.62 (ცნობილ საბანკო კალკულატორთან შედარებული ეტალონი).
- 0% განაკვეთი → payment = principal/term (ზღვრული შემთხვევა, ფორმულა 0/0-ს არიდებს).
- `calcTermMonths`: შენატანი ≤ პირველი თვის პროცენტი → ვალიდაციის error („ვალი არასდროს დაიფარება").
- `buildSchedule`: ბოლო რიგის remainingPrincipal === 0 ზუსტად; interestPart-ების ჯამი + principal-ების ჯამი === payment-ების ჯამი; principalPart-ების ჯამი === principal.
- თარიღები: 31 რიცხვში აღებული სესხი → თებერვალში 28/29 (month-end კორექცია, date-fns `addMonths` ქცევა დაფიქსირებული ტესტით).
- `simulateExtraMonthly`: extra=0 → monthsSaved 0, interestSaved 0; დიდი extra → ვადა მკვეთრად მოკლდება; interestSaved === ძველი ჯამური პროცენტი − ახალი.
- `simulateLumpSum`: amount ≥ დარჩენილი ძირი → ვალი იხურება იმ თვესვე.
- `rankDebtsForExtra`: avalanche აწყობს %-ით კლებადობით, snowball — ბალანსით ზრდადობით; ტოლობისას სტაბილური რიგი.

**Integration — actions:**
- `createDebt`: term↔payment ორივე მიმართულებით; Schedule ზუსტად termMonths რიგი; არავალიდური input-ები (უარყოფითი %, ორივე ან არცერთი term/payment) → error.
- `recordDebtPayment`: paid + Transaction ატომურად; ბოლო რიგი → PAID_OFF.
- `applyPrepayment`: გადახდილი რიგები ხელუხლებელი, გადაუხდელი regenerated; მოლოდინი სიმულაციის შედეგს ემთხვევა.

**Component:**
- სიმულატორის dialog: input → ორი რიცხვის რენდერი (engine mock-ით).
- გრაფიკის ცხრილი: paid/current/overdue მდგომარეობების რენდერი.

## 9. იმპლემენტაციის ეტაპები

| # | ეტაპი | შედეგი |
|---|---|---|
| 2.1 | Prisma მოდელები + მიგრაცია | ტიპები გენერირებული |
| 2.2 | `amortization.ts` + სრული unit ტესტები | engine ეტალონებთან შედარებით ზუსტია |
| 2.3 | debt-actions + ტესტები | CRUD, გადახდა, prepayment ატომურობით |
| 2.4 | `/debts` + `/debts/[id]` + სიმულატორი + კომპონენტ-ტესტები | ფლოუები §6.4 მუშაობს |
| 2.5 | შეხსენებები cron-ში + ტესტი | email-ები დროულად |
| 2.6 | `npm run build` + `npm run test` მწვანე; README სტატუსი | ფაზა დახურულია |
