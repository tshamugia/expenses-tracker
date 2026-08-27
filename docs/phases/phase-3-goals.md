# ფაზა 3 — მიზნები და სარეზერვო ფონდი

**PRD:** §7.4 (მიზნები და სარეზერვო ფონდი), R1 (ჯერ მინი-რეზერვი), D5 (მიზნის დაფინანსება), G3/G4
**წინაპირობა:** ფაზა 1 (Transaction, კატეგორიები `kind`-ით); ფაზა 2 სასურველია, მაგრამ არა ბლოკერი
**მზადაა, როცა:** რეზერვის მიზანი აქტიურია, პროგრესი ითვლება, ჩამორჩენა ჩანს კონკრეტული რეკომენდაციით.

---

## 1. მიმოხილვა

დაგროვება „ნარჩენიდან" გადადის დაგეგმილ, პრიორიტეტიზებულ ვალდებულებაში. მიზანი = სახელი + სამიზნე თანხა + სასურველი თარიღი + პრიორიტეტი. სისტემა ითვლის ორივე მიმართულებით: დედლაინიდან საჭირო თვიურ შენატანს, ან შენატანიდან რეალურ დასრულების თარიღს.

**სარეზერვო ფონდი** — სპეციალური, ჩაშენებული მიზანი: იქმნება ავტომატურად, ვერ წაიშლება, ყოველთვის პრიორიტეტი #1. სამიზნეს სისტემა თავად ითვლის სავალდებულო ხარჯებიდან, ორ საფეხურად: ჯერ 1 თვის ხარჯი, მიღწევის შემდეგ — 3 თვის (PRD §7.6-ის ეტაპებთან თანხვედრით). რეზერვიდან გატანა ცალკე, გააზრებული მოქმედებაა — მიზეზის სავალდებულო მითითებით (ეს მიზეზი ფაზა 4-ის ვერდიქტში „უკან" კომპონენტად აისახება).

## 2. Scope / Out of scope

**Scope:** Goal CRUD + პრიორიტეტიზაცია, შენატანების/გატანების ledger, რეზერვის ავტო-სამიზნე, პროგრესის/ჩამორჩენის engine, `/goals` გვერდი, მიღწევის შეტყობინებები.
**Out of scope:** მიზნების ავტომატური დაფინანსება თვიური გეგმიდან და Safe to spend-თან კავშირი (ფაზა 4); ინვესტიციები (არა-მიზანი).

## 3. მონაცემთა მოდელი (Prisma)

```prisma
enum GoalStatus {
  ACTIVE
  PAUSED
  ACHIEVED
  ARCHIVED
}

model Goal {
  id                  String     @id @default(uuid()) @db.Uuid
  userId              String     @db.Uuid
  name                String
  targetAmount        Decimal    @db.Decimal(12, 2) // რეზერვისთვის — ავტო-გამოთვლილი, კეშირებული
  currency            String     @default("GEL")
  targetDate          DateTime?  // სასურველი თარიღი (optional — მაშინ შენატანიდან ითვლება)
  monthlyContribution Decimal?   @db.Decimal(12, 2) // დაგეგმილი შენატანი (optional — მაშინ თარიღიდან ითვლება)
  priority            Int        // 1 = უმაღლესი; რეზერვი ყოველთვის 1, დანარჩენები 2+
  status              GoalStatus @default(ACTIVE)
  isEmergencyFund     Boolean    @default(false) // სისტემური მიზანი: ვერ იშლება, priority ვერ იცვლება
  reserveStage        Int?       // რეზერვისთვის: 1 (= 1 თვე) ან 3 (= 3 თვე)
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt

  user          User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  contributions GoalContribution[]

  @@index([userId, status, priority])
}

model GoalContribution {
  id            String   @id @default(uuid()) @db.Uuid
  goalId        String   @db.Uuid
  amount        Decimal  @db.Decimal(12, 2) // დადებითი = შენატანი, უარყოფითი = გატანა
  date          DateTime
  reason        String?  // გატანისას სავალდებულო
  transactionId String?  @db.Uuid // ბმა ledger-ზე
  createdAt     DateTime @default(now())

  goal Goal @relation(fields: [goalId], references: [id], onDelete: Cascade)

  @@index([goalId, date])
}
```

**რეზერვის ავტო-სამიზნის წესი:** `targetAmount = სავალდებულო თვიური ხარჯი × reserveStage`. სავალდებულო თვიური ხარჯი = FIXED კატეგორიების ბოლო 3 თვის საშუალო + აქტიური ფიქსირებული Expense-ების თვიური ჯამი. გადაითვლება თვეში ერთხელ (cron) და ხელით „განახლება" ღილაკით; ცვლილებისას მომხმარებელს ეცნობება. Stage 1 მიღწევისას (დაგროვილი ≥ სამიზნე) → milestone notification + შეთავაზება stage 3-ზე გადასვლის.

## 4. Engine — `lib/services/goal-math.ts` (სუფთა ფუნქციები)

```typescript
export function requiredMonthlyContribution(remaining: number, monthsLeft: number): number
export function projectedCompletionDate(remaining: number, monthlyContribution: number, from: Date): Date | null
// null — თუ contribution ≤ 0 (ვერასდროს მიაღწევს)

export type GoalProgress = {
  saved: number            // contributions-ის ჯამი (გატანების გამოკლებით)
  targetAmount: number
  percent: number          // 0–100, capped
  monthsLeft: number | null
  requiredMonthly: number | null   // targetDate-იდან
  projectedDate: Date | null       // monthlyContribution-იდან
  status: 'on_track' | 'behind' | 'achieved' | 'no_plan'
  // behind: projectedDate > targetDate (ან requiredMonthly > მიმდინარე შენატანი)
  behindAdvice?: {                  // §7.4: კონკრეტული რეკომენდაცია
    increaseMonthlyBy: number       // რამდენით გაიზარდოს შენატანი, რომ დედლაინი დარჩეს
    orMoveDateTo: Date              // ან რა თარიღზე გადაიწიოს მიმდინარე შენატანით
  }
}
export function calcGoalProgress(goal, contributions, today: Date): GoalProgress

export function calcMandatoryMonthlyExpense(fixedExpensesMonthly: number, fixedCategorySpend3moAvg: number): number
export function calcReserveTarget(mandatoryMonthly: number, stage: 1 | 3): number
```

## 5. Server Actions — `lib/actions/goal-actions.ts`

- `createGoal / updateGoal / archiveGoal` — რეზერვზე (`isEmergencyFund`) archive/delete/priority-change დაბლოკილია server-side-ზეც.
- `getGoals()` — ყველა აქტიური მიზანი პროგრესით, პრიორიტეტის რიგით (რეზერვი ყოველთვის პირველი).
- `contributeToGoal(goalId, { amount, date })` — `GoalContribution` + `Transaction {EXPENSE → საკუთარი დანაზოგი}` ატომურად; achieved-ის შემოწმება.
- `withdrawFromGoal(goalId, { amount, reason, date })` — reason სავალდებულო; amount > saved → error; notification „რეზერვიდან გატანა: [მიზეზი]".
- `recalcReserveTarget()` — ავტო-სამიზნის გადათვლა (cron + ხელით ღილაკი); ცვლილებისას notification.
- `ensureEmergencyFund(userId)` — idempotent: ქმნის რეზერვის მიზანს stage 1-ით, თუ არ არსებობს (გამოიძახება login-ზე/გვერდის პირველ ჩატვირთვაზე).
- `advanceReserveStage(goalId)` — stage 1 → 3 მომხმარებლის დადასტურებით.

## 6. UI / ეკრანები

### 6.1 `/goals` — მთავარი გვერდი
- **რეზერვის ბარათი (ყოველთვის პირველი, გამორჩეული სტილით):** „სარეზერვო ფონდი — ეტაპი 1/2", პროგრეს-ბარი saved/target %, სამიზნის ახსნა („1 თვის სავალდებულო ხარჯი = 2,100₾"), მიღწევის პროგნოზი, ღილაკები: შენატანი · გატანა (reason-ის dialog-ით, გამაფრთხილებელი ტონით).
- **მიზნების სია (პრიორიტეტის რიგით):** ბარათი — სახელი, პროგრეს-ბარი, saved/target, სტატუსის badge: „გრაფიკშია" (მწვანე) / „ჩამორჩება" (ყვითელი, behindAdvice-ის ტექსტით: „+45₾/თვე ან თარიღი → ივნისი") / „მიღწეულია" 🎉.
- Drag-and-drop ან ↑↓ პრიორიტეტის შესაცვლელად (რეზერვი ფიქსირებული).
- „მიზნის დამატება" dialog: სახელი, სამიზნე, ვალუტა, თარიღი **ან** თვიური შენატანი (მეორე ლაივში ითვლება და ჩანს), პრიორიტეტი.

### 6.2 მიზნის დეტალი (expandable ბარათი ან `/goals/[id]`)
- შენატანების/გატანების ისტორია (თარიღი, თანხა, მიზეზი).
- პროგრესის ხაზოვანი ჩარტი დროში (Recharts) + პროექციის წერტილოვანი ხაზი სამიზნემდე.

### 6.3 მომხმარებლის ფლოუები
1. **პირველი შესვლა ფაზის შემდეგ:** /goals → რეზერვის ბარათი უკვე არსებობს (ensureEmergencyFund) სამიზნით 2,100₾ (ავტო-გამოთვლილი) → „საიდან მოდის ეს რიცხვი?" tooltip ხსნის ფორმულას.
2. **მიზნის შექმნა:** „ტექნიკა, 1500₾, დეკემბრამდე" → სისტემა აჩვენებს: „საჭიროა 375₾/თვე" → შენახვა.
3. **შენატანი:** მიზნის ბარათზე „+" → 200₾ → პროგრესი და პროგნოზის თარიღი განახლდა.
4. **ჩამორჩენა:** 2 თვე შენატანი არ ყოფილა → badge „ჩამორჩება: +125₾/თვე ან თარიღი → თებერვალი".
5. **რეზერვიდან გატანა:** „გატანა" → თანხა + მიზეზი („მანქანის რემონტი") → დადასტურება → პროგრესი შემცირდა, notification დაფიქსირდა.
6. **ეტაპის მიღწევა:** saved ≥ target (stage 1) → milestone ბანერი + email → შეთავაზება: „გადავიდეთ 3-თვიან სამიზნეზე?" → დადასტურება → target ×3.

## 7. შეტყობინებები
- მიზანი მიღწეულია — email + in-app (milestone ტონით).
- რეზერვის ეტაპი შეივსო — milestone email (PRD §7.9).
- რეზერვიდან გატანა — in-app დაფიქსირება.
- რეზერვის სამიზნე გადაითვალა და შეიცვალა ±10%-ზე მეტით — in-app ახსნით.

## 8. ტესტირება (Definition of Done-ის ნაწილი)

**Unit — `goal-math.test.ts`:**
- `requiredMonthlyContribution(1500, 4)` → 375; monthsLeft 0 ან უარყოფითი → მთელი remaining ერთ თვეში.
- `projectedCompletionDate`: contribution 0/უარყოფითი → null; ზუსტი გაყოფა vs ნაშთიანი (ceil თვეებში).
- `calcGoalProgress`: achieved (saved ≥ target, percent capped 100); behind სცენარი → behindAdvice ორივე რიცხვით სწორია (increaseMonthlyBy-ით დედლაინი ზუსტად ჯდება); no_plan (არც თარიღი, არც შენატანი); გატანების (უარყოფითი contributions) სწორი დაჯამება.
- `calcReserveTarget`: stage 1/3; mandatoryMonthly 0 → target 0 (ახალი მომხმარებელი).

**Integration — actions:**
- `ensureEmergencyFund`: idempotent — ორჯერ გამოძახება ერთ მიზანს ტოვებს.
- `withdrawFromGoal`: reason-ის გარეშე → error; amount > saved → error; წარმატება → უარყოფითი contribution + notification.
- `contributeToGoal`: Contribution + Transaction ატომურად; target-ის მიღწევა → status ACHIEVED + notification.
- რეზერვის დაცვა: `archiveGoal`/priority ცვლილება isEmergencyFund-ზე → error.
- `advanceReserveStage`: target ×3 გადაითვლება, status ისევ ACTIVE.

**Component:**
- მიზნის ფორმა: თარიღის შეყვანისას შენატანი ლაივში ითვლება და პირიქით.
- გატანის dialog: reason ცარიელი → submit დაბლოკილი.
- ბარათის სამი სტატუსის რენდერი (on_track/behind/achieved).

## 9. იმპლემენტაციის ეტაპები

| # | ეტაპი | შედეგი |
|---|---|---|
| 3.1 | Prisma მოდელები + მიგრაცია | ტიპები გენერირებული |
| 3.2 | `goal-math.ts` + unit ტესტები | engine მწვანე |
| 3.3 | goal-actions + ensureEmergencyFund + ტესტები | რეზერვი ავტომატურად არსებობს და დაცულია |
| 3.4 | `/goals` UI + dialogs + კომპონენტ-ტესტები | ფლოუები §6.3 მუშაობს |
| 3.5 | Milestone შეტყობინებები + რეზერვის cron გადათვლა + ტესტები | წერილები დროულად |
| 3.6 | `npm run build` + `npm run test` მწვანე; README სტატუსი | ფაზა დახურულია |
