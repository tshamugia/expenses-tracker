'use client'

/**
 * /expenses tab shell (Phase 1 §6.3):
 * ფიქსირებული (existing Expense list) · ცვლადი (Transaction ledger) · კატეგორიები.
 * Content for each tab is passed as server-rendered children.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ExpensesTabsProps {
  defaultTab: string
  fixed: React.ReactNode
  variable: React.ReactNode
  categories: React.ReactNode
}

const VALID_TABS = ['fixed', 'variable', 'categories']

export function ExpensesTabs({ defaultTab, fixed, variable, categories }: ExpensesTabsProps) {
  const initialTab = VALID_TABS.includes(defaultTab) ? defaultTab : 'fixed'

  return (
    <Tabs defaultValue={initialTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="fixed">ფიქსირებული</TabsTrigger>
        <TabsTrigger value="variable">ცვლადი</TabsTrigger>
        <TabsTrigger value="categories">კატეგორიები</TabsTrigger>
      </TabsList>
      <TabsContent value="fixed">{fixed}</TabsContent>
      <TabsContent value="variable">{variable}</TabsContent>
      <TabsContent value="categories">{categories}</TabsContent>
    </Tabs>
  )
}
