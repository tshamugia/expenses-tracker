# ფაზა 5 — Claude ასისტენტი (MCP)

**PRD:** §7.8 (Claude ასისტენტი), R8 (ჯერ read-only), D2 (read + write, per-user token), ს3 (დიდი ხარჯის განზრახვა)
**წინაპირობა:** ფაზა 4 (გეგმა/Safe to spend — ძირითადი კითხვების პასუხები ამ მონაცემებზე დგას)
**მზადაა, როცა:** Claude რეალურ მონაცემებზე პასუხობს და (მეორე ეტაპზე) დადასტურებით ჩანაწერს ამატებს.

---

## 1. მიმოხილვა

MCP სერვერი აპლიკაციას უერთდება და Claude-ს აძლევს რეალური, მიმდინარე მდგომარეობის ხედვას. შედეგი: „შემიძლია 800₾-იანი მონიტორი ვიყიდო?" კითხვაზე პასუხი შენს ციფრებზეა და არა ზოგად რჩევაზე. მიწოდება ორ ეტაპად (R8):

- **5A — Read-only (პირველი 2–4 კვირა):** მხოლოდ კითხვის ინსტრუმენტები. ნდობისა და პასუხების ხარისხის ჩამოყალიბება.
- **5B — Write:** ჩანაწერის დამატება/სიმულაცია/გეგმის კორექტივის შეთავაზება — ყველა write ლოგირდება და აპში confirmation-ს გადის.

**არქიტექტურული გადაწყვეტილება:** MCP სერვერი — იმავე Next.js აპში, HTTP ტრანსპორტით: `app/api/mcp/route.ts` (`@modelcontextprotocol/sdk`-ის streamable HTTP server ან `mcp-handler` პაკეტი). ცალკე სერვისი არ იქმნება (single-app პრინციპი). Tool-ები **არ იმეორებენ ლოგიკას** — იძახებენ იმავე service/engine ფენას, რასაც Server Actions.

## 2. Scope / Out of scope

**Scope:** per-user API token, MCP endpoint, read tools (5A), write tools confirmation-ფლოუთი (5B), AuditLog, `/settings`-ში ტოკენის მართვის UI, დოკუმენტაცია Claude Desktop/Code-ში დასამატებლად.
**Out of scope:** Claude-ის მიერ გეგმის ავტონომიური შეცვლა (მხოლოდ შეთავაზება + user confirmation); წაშლის ოპერაციები MCP-დან (საერთოდ არ ემატება ამ ვერსიაში); არაფინანსური ოპერაციები (პროფილი, პაროლი, ტოკენები — არასდროს).

## 3. მონაცემთა მოდელი (Prisma)

```prisma
model ApiToken {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @db.Uuid
  name       String    // "Claude Desktop"
  tokenHash  String    @unique // bcrypt/sha256 — plaintext მხოლოდ შექმნისას ჩანს ერთხელ
  scopes     String[]  // ["finance:read"] | ["finance:read", "finance:write"]
  lastUsedAt DateTime?
  expiresAt  DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  actor     String   // "USER" | "CLAUDE"
  action    String   // "transaction.create", "prepayment.simulate", ...
  payload   Json     // რა მოთხოვნა იყო
  result    String   // "SUCCESS" | "REJECTED" | "PENDING_CONFIRMATION" | "ERROR"
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}

model PendingAction {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  action    String   // write tool-ის სახელი
  payload   Json
  status    String   @default("PENDING") // PENDING | CONFIRMED | REJECTED | EXPIRED
  expiresAt DateTime // შექმნიდან 15 წუთი
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status])
}
```

ფაზა 1-ის `EntrySource.CLAUDE` აქ იწყებს მუშაობას: MCP-დან შექმნილი ყველა ჩანაწერი ამ წყაროთი ინახება.

## 4. MCP Tools

### 5A — Read (`finance:read` scope)

| Tool | აბრუნებს | პასუხობს კითხვას |
|---|---|---|
| `get_financial_snapshot` | Safe to spend (თვე/დღე), აქტიური გეგმა planned vs actual, წმინდა პოზიცია, ეტაპი | „რამდენი დამრჩა ამ თვეში?" |
| `get_debts` | ვალები: დარჩენილი ძირი, %, შენატანი, დასრულების თარიღი, ჯამური პროცენტი | „როდის დავასრულებ სესხს და რა ჯდება ჯამში?" |
| `get_goals` | მიზნები + რეზერვი: saved/target, სტატუსი, პროგნოზი | „რამდენი მაქვს ტექნიკის მიზანზე?" |
| `get_transactions` | ledger ფილტრებით (პერიოდი, ტიპი, კატეგორია) | „რაში წავიდა ფული ამ თვეში?" |
| `get_monthly_history` | დახურული თვეები: გეგმა vs ფაქტი, ვერდიქტები, ტრენდები | „შემიდარე ბოლო 3 თვე — რა ტენდენციაა?" |
| `simulate_prepayment` | ფაზა 2-ის სიმულატორი: monthsSaved + interestSaved | „რას მომცემს 2000₾-ის შეტანა?" (კითხვაა — არაფერს ცვლის) |
| `check_affordability` | მოცემულ თანხაზე: თავისუფალი ნაშთი, მიზნებზე გავლენა, ვარიანტები | ს3: „შემიძლია 800₾-იანი მონიტორი?" |

თითო tool-ს აქვს მკაფიო description ქართული კონტექსტით, რომ Claude-მა სწორად აარჩიოს. ყველა პასუხი default ვალუტაში, თარიღები ISO.

### 5B — Write (`finance:write` scope, დადასტურების ფლოუთი)

| Tool | ქმედება | დადასტურება |
|---|---|---|
| `add_transaction` | ხარჯის/შემოსავლის ჩაწერა („ჩაწერე 45₾ კვებაზე") | ≤100₾ EXPENSE — პირდაპირ (low-risk); სხვა — PendingAction |
| `contribute_to_goal` | მიზანზე შენატანი | PendingAction |
| `apply_prepayment` | წინსწრებითი დაფარვის გატარება | ყოველთვის PendingAction |
| `propose_plan_adjustment` | გეგმის კორექტივის შეთავაზება | ყოველთვის PendingAction |

**Confirmation ფლოუ:** write tool → `PendingAction` + in-app notification („Claude გთავაზობს: 2000₾ წინსწრებით X ვალზე — [დადასტურება] [უარყოფა]") → მომხმარებელი აპში ადასტურებს → მოქმედება სრულდება იმავე Server Action-ებით, რაც UI-დან. Tool-ის პასუხი Claude-ს: „შეთავაზება გაგზავნილია დასადასტურებლად". Expire — 15 წუთი.

**დაცვა (PRD §7.8):** მოქმედებები მხოლოდ ფინანსური ოპერაციებია; ყველა MCP call → AuditLog (actor: CLAUDE); rate limit (მაგ. 60 req/წთ token-ზე); scope-ების შემოწმება თითო tool-ზე; token revoke მყისიერად წყვეტს წვდომას.

## 5. Auth და Settings UI

- **Auth:** `Authorization: Bearer <token>` → hash lookup → userId + scopes. Session/cookie ამ endpoint-ზე არ გამოიყენება.
- **`/settings` ახალი სექცია „Claude ინტეგრაცია":**
  - ტოკენის შექმნა (სახელი + scope არჩევა read / read+write) → plaintext ერთხელ ჩანს copy ღილაკით.
  - აქტიური ტოკენების სია (სახელი, scope, lastUsedAt) + revoke.
  - Setup ინსტრუქცია: მზა JSON სნიპეტი Claude Desktop/Claude Code-ისთვის (`mcpServers` კონფიგი endpoint-ის URL-ით).
  - **აქტივობის ლოგი:** AuditLog-ის ხედი — რა გააკეთა Claude-მ და როდის (PRD: „ჩანს, ვინ გააკეთა — მე თუ Claude").
- **Pending actions:** notification bell-ში + `/settings`-ის ბლოკში დადასტურება/უარყოფა.

## 6. მომხმარებლის ფლოუები

1. **Setup:** /settings → „ტოკენის შექმნა" (read-only) → სნიპეტის კოპირება Claude Desktop-ში → Claude-ს ეკითხება „რამდენი დამრჩა ამ თვეში?" → `get_financial_snapshot` → პასუხი რეალური ციფრებით.
2. **ს3:** „შემიძლია 800₾-იანი მონიტორი ვიყიდო ისე, რომ მიზნები არ დაზარალდეს?" → `check_affordability(800)` → Claude პასუხობს ვარიანტებით (ახლავე მიზნის თანხით + ნაშთით / ერთი თვის მოცდა).
3. **Write ჩართვა (2–4 კვირის შემდეგ):** ახალი ტოკენი write scope-ით → „ჩაწერე 45₾ კვებაზე" → პირდაპირ ჩაიწერა (low-risk) → toast აპში, AuditLog-ში actor: CLAUDE.
4. **დიდი მოქმედება:** „შეიტანე 2000₾ წინსწრებით X ვალზე" → PendingAction → აპში დადასტურება → გრაფიკი გადათვლილია.

## 7. ტესტირება (Definition of Done-ის ნაწილი)

**Unit — auth/scope:**
- ვალიდური token → userId/scopes; revoked/expired/არარსებული → 401; write tool read scope-ით → 403.
- Token hash: plaintext არასდროს ინახება; ორჯერ იგივე plaintext → hash match.

**Integration — read tools (ტესტ-DB fixture-ებით):**
- `get_financial_snapshot`: ფაზა 4-ის `getActivePlan`-თან იდენტური რიცხვები (ერთი წყაროს ტესტი — tool ლოგიკას არ იმეორებს).
- `check_affordability`: სამი სცენარი — ეტევა თავისუფალში / ეტევა მიზნის თანხით / ვერ ეტევა.
- `simulate_prepayment`: ფაზა 2-ის engine-ის შედეგს ემთხვევა; DB არ იცვლება.
- ყველა read call → AuditLog ჩანაწერი actor: CLAUDE.

**Integration — write tools:**
- `add_transaction` 45₾ → Transaction {entrySource: CLAUDE} პირდაპირ; 500₾ → PendingAction, Transaction არ იქმნება.
- PendingAction confirm → მოქმედება სრულდება; reject → არა; 15 წუთის შემდეგ → EXPIRED, confirm → error.
- Rate limit: ზღვარს ზემოთ → 429.
- სხვისი userId-ის მონაცემზე წვდომის მცდელობა შეუძლებელია (token → userId იზოლაცია).

**Component:**
- ტოკენის შექმნის ფლოუ: plaintext მხოლოდ ერთხელ ჩანს; სია + revoke.
- Pending action ბარათი: confirm/reject ღილაკები სწორ action-ს იძახებენ.

**ხელით მიმღები ტესტი (ფაზის დახურვამდე):** რეალური Claude Desktop მიერთება ტესტ-იუზერზე და §6-ის 4 ფლოუს გავლა.

## 8. იმპლემენტაციის ეტაპები

| # | ეტაპი | შედეგი |
|---|---|---|
| 5.1 | Prisma მოდელები (ApiToken, AuditLog, PendingAction) + მიგრაცია | ტიპები გენერირებული |
| 5.2 | Token auth + `/settings` ტოკენების UI + ტესტები | ტოკენი იქმნება/უქმდება |
| 5.3 | MCP endpoint + read tools + ტესტები (**5A რელიზი**) | Claude კითხულობს რეალურ მონაცემებს |
| 5.4 | 2–4 კვირა 5A გამოყენება; პასუხების ხარისხზე დაკვირვება (R8) | Go/no-go write-ზე |
| 5.5 | Write tools + PendingAction ფლოუ + AuditLog UI + ტესტები (**5B რელიზი**) | დადასტურებით ჩანაწერი ემატება |
| 5.6 | ხელით მიმღები ტესტი + `npm run build`/`npm run test` მწვანე; README სტატუსი | ფაზა დახურულია |
