# ფაზა 6 — ბანკის ინტეგრაცია

**PRD:** §7.10 (ბანკის ინტეგრაცია), R6 (მზადყოფნა დღეიდან, ინტეგრაცია ბოლოს), Q4 (აგრეგატორი vs პირდაპირი API)
**წინაპირობა:** ფაზა 1 (Transaction + `externalId` + `entrySource` — სწორედ ამ ფაზისთვის ჩაიდო); ფაზა 4 სასურველია (კატეგორიზებული იმპორტი გეგმის actual-ებს ავტომატურად ავსებს)
**მზადაა, როცა:** თვის ტრანზაქციების ≥80% სისტემაში ხელის შეხების გარეშე ხვდება.

---

## 1. მიმოხილვა

მიზანი: ხელით ჩაწერის დაყვანა ნულთან. ორი ეტაპი:

- **6A — ამონაწერის იმპორტი:** თიბისის / საქართველოს ბანკის ამონაწერის ფაილის ატვირთვა → ტრანზაქციების ამოცნობა → წესებით კატეგორიზაცია → დედუპლიკაცია → გაურკვევლების გადამოწმების რიგი. სარგებლის ~80% Open Banking-ის სირთულის გარეშე, დღესვე განხორციელებადი.
- **6B — Open Banking API:** ავტომატური სინქრონიზაცია ფაილების გარეშე. დამოკიდებულია საქართველოში ფიზიკური პირის აპისთვის წვდომის პრაქტიკულობაზე — ეტაპის დასაწყისში ბაზრის კვლევით წყდება (Q4). 6A ამ მოლოდინზე არ არის დამოკიდებული.

## 2. Scope / Out of scope

**Scope (6A):** ფაილის ატვირთვა (CSV/XLSX — ორივე ბანკის ფორმატი), პარსერები, კატეგორიზაციის თვითმსწავლი წესები, დედუპლიკაცია (ბანკი↔ბანკი და ბანკი↔ხელით), გადამოწმების რიგის UI, იმპორტის ისტორია.
**Scope (6B):** კვლევის სპაიკი + (თუ ტექნიკურად შესაძლებელია) ერთი ბანკის სინქრონიზაცია.
**Out of scope:** გადახდის ინიცირება (payment initiation) — მხოლოდ account information; PDF ამონაწერის OCR (მხოლოდ სტრუქტურირებული ფაილები).

## 3. მონაცემთა მოდელი (Prisma)

```prisma
enum ImportStatus {
  PROCESSING
  REVIEW_NEEDED  // არის გადასამოწმებელი რიგები
  COMPLETED
  FAILED
}

enum ImportRowStatus {
  AUTO_CATEGORIZED  // წესმა დაახარისხა → Transaction შეიქმნა
  NEEDS_REVIEW      // კატეგორია ვერ დადგინდა
  DUPLICATE         // გამოტოვებულია
  CONFIRMED         // user-მა გადაამოწმა → Transaction შეიქმნა
  IGNORED           // user-მა უარყო (მაგ. ანგარიშებს შორის გადარიცხვა)
}

model ImportBatch {
  id            String       @id @default(uuid()) @db.Uuid
  userId        String       @db.Uuid
  bank          String       // "TBC" | "BOG"
  fileName      String
  status        ImportStatus @default(PROCESSING)
  totalRows     Int          @default(0)
  autoRows      Int          @default(0)
  reviewRows    Int          @default(0)
  duplicateRows Int          @default(0)
  createdAt     DateTime     @default(now())

  user User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  rows ImportRow[]

  @@index([userId, createdAt])
}

model ImportRow {
  id            String          @id @default(uuid()) @db.Uuid
  batchId       String          @db.Uuid
  externalId    String          // ბანკის ტრანზაქციის ID (ან hash: date+amount+description)
  date          DateTime
  amount        Decimal         @db.Decimal(12, 2) // უარყოფითი = ხარჯი
  currency      String
  description   String          // ბანკის raw აღწერა ("SHOP GOODWILL TBILISI")
  status        ImportRowStatus
  categoryId    String?         @db.Uuid
  transactionId String?         @db.Uuid // შექმნილი Transaction-ის ბმა
  matchedRuleId String?         @db.Uuid

  batch ImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@index([batchId, status])
}

model CategoryRule {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @db.Uuid
  pattern    String   // substring match, case-insensitive ("GOODWILL")
  categoryId String   @db.Uuid
  hitCount   Int      @default(0)  // რამდენჯერ იმუშავა — პრიორიტეტისთვის
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, pattern])
  @@index([userId])
}
```

შექმნილი `Transaction`-ები: `entrySource: IMPORT` (6B-ში `BANK`), `externalId` შევსებული — `@@unique([userId, externalId])` (ფაზა 1-იდან) მეორედ იმპორტს DB დონეზეც ბლოკავს.

## 4. Engine-ები (სუფთა ფუნქციები)

### 4.1 `lib/services/statement-parser.ts`
```typescript
export type ParsedRow = { externalId: string; date: Date; amount: number; currency: string; description: string }
export function detectBankFormat(headerRow: string[]): 'TBC' | 'BOG' | null
export function parseTbcStatement(fileContent): ParsedRow[]
export function parseBogStatement(fileContent): ParsedRow[]
// externalId: ბანკის ID თუ ფაილშია; თუ არა — sha256(date|amount|description) დეტერმინისტული hash
```
ფორმატები რეალური ამონაწერების ნიმუშებით დაზუსტდება იმპლემენტაციისას; პარსერი fixture-ფაილებზე ტესტირდება.

### 4.2 `lib/services/categorizer.ts`
```typescript
// წესები hitCount-ის კლებადობით; პირველი substring match იგებს
export function categorize(description: string, rules: CategoryRule[]): { categoryId: string; ruleId: string } | null
// user-მა review-ში კატეგორია აირჩია → წესი ისწავლება:
export function deriveRule(description: string, categoryId: string): { pattern: string }
// pattern = გასუფთავებული merchant-ის ფრაგმენტი (ციფრების/თარიღების მოჭრით), მომხმარებელს რედაქტირება შეუძლია
```

### 4.3 `lib/services/dedup.ts`
```typescript
// 1) externalId ზუსტი დამთხვევა არსებულ Transaction-თან → DUPLICATE
// 2) ხელით ჩაწერილთან heuristic: იგივე თანხა ± იგივე ვალუტა, თარიღი ±2 დღე, type EXPENSE → სავარაუდო დუბლი (review-ში ეშვება ბმის შეთავაზებით, ავტომატურად არ იშლება)
export function findDuplicates(rows: ParsedRow[], existing: ExistingTx[]): DedupResult[]
```

## 5. Server Actions — `lib/actions/import-actions.ts`

- `uploadStatement(formData)` — ფაილი → detectBankFormat → parse → dedup → categorize → ImportBatch + Rows ერთ `$transaction`-ში; AUTO_CATEGORIZED რიგებზე Transaction-ები მაშინვე იქმნება. აბრუნებს summary-ს.
- `getImportBatch(id)` / `getImportHistory()`.
- `reviewRow(rowId, { categoryId } | { ignore: true } | { linkToTransactionId })` — CONFIRMED + Transaction; კატეგორიის არჩევისას `deriveRule` → წესის შენახვა (**სწავლება**); ignore → IGNORED; link → ხელით ჩაწერილს externalId ეწერება (მომავალი დედუპლიკაციისთვის), ახალი არ იქმნება.
- `getCategoryRules()` / `updateRule` / `deleteRule` — წესების მართვა.
- `getAutomationRate(month)` — ავტომატურად მოხვედრილი ტრანზაქციების % (მიმღები კრიტერიუმის საზომი: ≥80%).

## 6. UI / ეკრანები

### 6.1 `/import` — ახალი გვერდი
- **ატვირთვის ზონა:** drag-and-drop / file picker, ბანკის ავტო-ამოცნობა, ინსტრუქცია („როგორ გადმოვწერო ამონაწერი TBC/BOG-დან" — accordion სქრინშოტების ადგილით).
- **შედეგის summary:** „48 ტრანზაქცია: 39 ავტომატურად დახარისხდა · 5 გადასამოწმებელია · 4 დუბლიკატი გამოტოვდა" + automation rate badge.
- **გადამოწმების რიგი:** თითო რიგზე — თარიღი, თანხა, ბანკის აღწერა, კატეგორიის select (categorizer-ის საუკეთესო ვარაუდი pre-selected თუ დაბალი confidence-ით არსებობს), ღილაკები: დადასტურება / იგნორი / „ეს უკვე ჩავწერე ხელით" (link). დადასტურებისას ჩუმად ინახება წესი — შემდეგ ჯერზე ავტომატური იქნება.
- **სავარაუდო დუბლები:** ცალკე ბლოკი შედარების ხედით (ბანკის რიგი ↔ ხელით ჩანაწერი) → „ერთი და იგივეა" / „სხვადასხვაა".
- **ისტორია:** ბატჩების სია სტატუსებით.
- `/settings`-ში ან `/import/rules`: ნასწავლი წესების სია (pattern → კატეგორია, hitCount) + რედაქტირება/წაშლა.

### 6.2 მომხმარებლის ფლოუები
1. **პირველი იმპორტი:** ატვირთვა → წესები ჯერ არ არსებობს → უმეტესობა NEEDS_REVIEW → 10 წუთში ყველას კატეგორია მიენიჭა → 30+ წესი ისწავლა.
2. **მეორე თვის იმპორტი:** ატვირთვა → 80%+ ავტომატურად → მხოლოდ 3-4 ახალი merchant გადასამოწმებელი. **სწორედ ეს არის მიმღები კრიტერიუმი.**
3. **დუბლი:** სადილი ხელით ჩაწერა 18₾, ამონაწერშიც მოვიდა → heuristic იჭერს → „ეს უკვე ჩავწერე" → ბმა, დუბლი არ შეიქმნა.
4. **იმპორტის შემდეგ:** დაშბორდზე თვის actual-ები და კატეგორიების ორიენტირები განახლებულია — ledger ერთიანია, წყარო კი ჩანს ტრანზაქციის დეტალში.

## 7. ეტაპი 6B — Open Banking (კვლევის სპაიკი)

1. **კვლევა (timebox 1 კვირა):** წვდომის ვარიანტები — აგრეგატორი, ბანკის პერსონალური API, პირდაპირი Open Banking რეგისტრაცია; ფასი/ვადები/ტექნიკური ბარიერი. შედეგი — წერილობითი დასკვნა ამ ფაილში (Q4-ის პასუხი).
2. **თუ განხორციელებადია:** `BankConnection` მოდელი (provider, tokens დაშიფრული, lastSyncAt), sync cron (დღეში 1×), მიღებული ტრანზაქციები **იმავე pipeline-ში** ეშვება, რასაც 6A (dedup → categorize → review) — `entrySource: BANK`. ახალი ლოგიკა არ იწერება, მხოლოდ ახალი წყარო (R6).
3. **თუ ჯერ არა:** ფაზა იხურება 6A-თი; 6B ბექლოგში რჩება გადამოწმების თარიღით.

## 8. ტესტირება (Definition of Done-ის ნაწილი)

**Unit — `statement-parser.test.ts` (fixture ამონაწერებზე — რეალური ფაილების ანონიმიზებული ასლები `__fixtures__/`-ში):**
- TBC/BOG ფორმატის ამოცნობა header-იდან; უცნობი ფორმატი → null → მკაფიო error UI-სთვის.
- სწორი პარსინგი: თარიღები (ქართული ფორმატები), უარყოფითი/დადებითი თანხები, ვალუტა, encoding (UTF-8/Windows-1251 თუ შეგვხვდა).
- externalId-ის დეტერმინიზმი: იგივე რიგი → იგივე hash.
- დაზიანებული/ცარიელი ფაილი → FAILED, არა exception.

**Unit — `categorizer.test.ts`:**
- substring match case-insensitive; hitCount პრიორიტეტი (ორი წესი ერგება → მაღალი hitCount იგებს).
- match არ არის → null → NEEDS_REVIEW.
- `deriveRule`: "SHOP GOODWILL TBILISI 12/08" → pattern "GOODWILL"-ის მსგავსი გასუფთავებული ფრაგმენტი.

**Unit — `dedup.test.ts`:**
- externalId დამთხვევა → DUPLICATE; თანხა+თარიღი ±2 დღე ხელითთან → სავარაუდო დუბლი; თანხა ემთხვევა, თარიღი 5 დღით შორს → არა-დუბლი.

**Integration — actions:**
- `uploadStatement`: batch + rows + auto Transaction-ები ატომურად; იგივე ფაილი მეორედ → ყველა რიგი DUPLICATE, 0 ახალი Transaction (idempotency — მთავარი ტესტი).
- `reviewRow` კატეგორიით: Transaction + CategoryRule იქმნება; შემდეგი იმპორტი იმავე merchant-ით → AUTO_CATEGORIZED (სწავლების end-to-end ტესტი).
- `reviewRow` link-ით: არსებულ Transaction-ს externalId ეწერება, ახალი არ იქმნება.
- `getAutomationRate`: fixture ბატჩზე სწორი %.

**Component:**
- ატვირთვის ზონა: წარმატება/შეცდომის მდგომარეობები.
- Review რიგი: სამი მოქმედების callback-ები; დუბლის შედარების ხედი.

## 9. იმპლემენტაციის ეტაპები

| # | ეტაპი | შედეგი |
|---|---|---|
| 6.1 | რეალური ამონაწერების ნიმუშების მოპოვება (TBC/BOG) + ფორმატის დაფიქსირება fixture-ებად | პარსერის სპეცი ზუსტია |
| 6.2 | Prisma მოდელები + მიგრაცია | ტიპები გენერირებული |
| 6.3 | პარსერები + categorizer + dedup + სრული unit ტესტები | engine-ები fixture-ებზე მწვანე |
| 6.4 | import-actions + idempotency/სწავლების ტესტები | pipeline ატომური და განმეორებადი |
| 6.5 | `/import` UI + review ფლოუ + კომპონენტ-ტესტები | ფლოუები §6.2 მუშაობს |
| 6.6 | 2 რეალური თვის ამონაწერზე ხელით მიმღები ტესტი: automation rate ≥80% მეორე იმპორტზე | **6A რელიზი** |
| 6.7 | 6B კვლევის სპაიკი + დასკვნა (Q4) | Go/no-go |
| 6.8 | (თუ go) BankConnection + sync + ტესტები; `npm run build`/`npm run test` მწვანე; README სტატუსი | ფაზა დახურულია |
