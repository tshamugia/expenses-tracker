# Phase 4b — Goal-Driven Automatic Monthly Plan

**Status:** implemented 2026-08-28 (`npm run build` + `npm run test` green — 328 tests).
**Supersedes:** the manual `DRAFT → CONFIRM → CLOSE` waterfall lifecycle from Phase 4.

## Motivation

The Phase 4 plan required the user to manually **confirm** a waterfall each month, and
goals only entered the plan through their stored `monthlyContribution` field. A goal
with only a **deadline** (e.g. "laptop in 3 months", "car repair in 2 months") and no
explicit monthly contribution contributed **0** to the plan — so the core use case
("tell me what to set aside this month to hit my goals") did not work.

The new model makes the monthly plan **automatic and goal-driven**: the system computes
what must be set aside this month to keep every goal on schedule, checks it against the
money left after obligations, and tracks whether the user actually set it aside.

## Locked product decisions (2026-08-28)

1. **Fully automatic** — no manual confirm. The plan is always computed from goals.
   `Safe to spend` remains, but derived automatically.
2. **X (required set-aside) = goals + emergency reserve.** Debts and mandatory bills are
   obligations shown separately, not part of X.
3. **"Achieved" = total set aside ≥ X** for the month (single headline number), with an
   optional per-goal breakdown for detail.

## Money model

```
income forecast
  − mandatory expenses (FIXED categories + recurring Expenses)   ┐ obligations
  − debt installments (this month's schedule rows)               ┘ (shown separately)
  ─────────────────────────────────────────────
  = availableForGoals                       ("remaining money")
  − X   (Σ per-goal required this month  +  reserve)
  ─────────────────────────────────────────────
  = Safe to Spend   (floored at 0)
```

Per goal, required-this-month:
- **has targetDate** → `remaining ÷ monthsLeft` (`requiredMonthlyContribution`, already in `goal-math.ts`)
- else **has monthlyContribution** → `min(monthlyContribution, remaining)`
- else → `0`

Reserve (no deadline): required = `min(monthlyContribution, remaining)`; `0` if no
contribution pace set.

**Achievement:** `Y = actual net contributions to goals + reserve this month`;
`achieved = Y ≥ X`.

**Feasibility:** if `X > availableForGoals` the plan does **not** block (it is automatic).
It surfaces read-only advice: push the nearest deadline out, or reduce a goal's target /
contribution. Goals still display their required amounts.

## Implementation steps

### Step 1 — engine + input (pure logic + tests)
- `lib/services/plan-engine.ts`: add `obligations`, `availableForGoals`,
  `requiredSetAside`, `feasible`, `shortfall` to `PlanResult`; safe-to-spend becomes
  `availableForGoals − X`; deficit options become read-only advice.
- `lib/services/plan-input.ts`: derive each goal's required-this-month from its deadline
  (fallback to stored contribution); accept a `referenceDate` for deterministic tests.
- Full unit tests: deadline-driven amounts, reserve inclusion, feasible/infeasible,
  edge cases (past deadline, achieved goal, zero income).

### Step 2 — actions + migration + history
- Generate the plan directly as the **active** plan (reuse `CONFIRMED` as "active" — no
  enum change, so the migration guard passes); remove `confirmPlan`/`reopenPlan` from the
  flow; auto-regenerate on goal/income/debt mutations and via cron.
- `buildPlanView` / `getDashboardData`: expose `requiredSetAside`, `actualSetAside`,
  `achieved`, and the per-goal breakdown.
- Migration (additive, non-destructive): `MonthClose.requiredSetAside`,
  `MonthClose.actualSetAside`, `MonthClose.achieved`.
- Update action tests.

### Step 3 — UI + i18n + dashboard + cron
- Rewrite `components/plan/plan-client.tsx`: headline "Set aside ₾X this month" +
  progress (Y / X) + achieved badge; per-goal breakdown; obligations read-only;
  Safe-to-spend; infeasible → advice card. Remove Confirm/Reopen/DeficitBlock.
- Dashboard: add the set-aside headline to the plan-progress card.
- i18n keys in **both** `messages/en.json` and `messages/ka.json`.
- Cron: generate the current month + auto-close the previous month (verdict + achieved).

## Notes / deferred

### Follow-ups implemented 2026-09-07
- **Event-driven regeneration** — the current month's plan now auto-recomputes the
  moment a goal, income source or debt changes. A shared, non-fatal
  `regenerateCurrentPlan(userId)` (`lib/services/plan-generation.ts`) is called from
  the goal (`update`/`archive`/`approve`/`contribute`/`withdraw`/`advanceReserveStage`),
  income-source (`create`/`update`/`archive`) and debt (`create`/`update`/`archive`/
  `applyPrepayment`) mutation actions. It swallows errors and skips a CLOSED month,
  so a refresh failure never fails the mutation. "Recalculate" on `/plan` stays as a
  manual affordance.
- **Cron auto-close** — the daily cron (on the 1st, before generating the new month)
  now auto-closes any still-open (`CONFIRMED`) plan from an elapsed month via
  `autoCloseElapsedMonths` (`lib/services/plan-cron.ts`), recording the verdict +
  `achieved` and sending a summary digest (`notifyMonthClosed`). The close core was
  extracted into a session-free `closePlanForUser` (`lib/services/plan-close.ts`);
  the `closeMonth` Server Action and the cron both call it. The shared money-math
  (`gatherMonthActuals`, `buildSetAside`, `buildCloseLines`, `actualForAllocation`,
  serializers, …) moved to `lib/services/month-actuals.ts` — a `'use server'` file
  may only export async functions, so these helpers could not live in `plan-actions`.
- **Windfall → automatic recommendation** — the manual `applyWindfall` (which
  mutated allocations and was inconsistent with auto-regeneration) is removed. The
  windfall now surfaces as a read-only recommendation on `/plan` with deep-link CTAs
  to `/debts` and `/goals`; acting on it (a real payment/contribution) re-derives the
  plan via event-driven regeneration.

### Still deferred
- Surfacing the windfall recommendation on the dashboard (currently `/plan` only).
- Enum note: the plan is created directly as `CONFIRMED` ("active"); the `PlanStatus`
  enum is unchanged (`DRAFT` is simply never used now), so no destructive migration.

## Files changed
- `lib/services/plan-engine.ts` — additive `requiredSetAside`/`availableForGoals`/`feasible`/`shortfall`.
- `lib/services/goal-math.ts` — `goalRequiredThisMonth` (deadline-driven per-goal amount).
- `lib/services/plan-input.ts` — feeds each goal its deadline-derived contribution.
- `lib/services/plan-generation.ts` — creates the plan as active (CONFIRMED), skips only CLOSED.
- `lib/actions/plan-actions.ts` — `buildSetAside`, auto-generate on view, achievement in close + dashboard.
- `prisma/migrations/20260827205634_goal_driven_achievement/` — `MonthClose` achievement columns.
- `types/plan-types.ts` — `SetAsidePlan`/`SetAsideLine`, `PlanView.setAside`, dashboard + close fields.
- `components/plan/plan-client.tsx` — new set-aside UI (no confirm), Recalculate + Close.
- `app/(private)/dashboard/dashboard-client.tsx` — set-aside headline.
- `messages/en.json` + `messages/ka.json` — new bilingual keys.
- Tests: `goal-math.test.ts`, `plan-engine.test.ts`, `plan-actions.test.ts`, `plan-client.test.tsx`.
