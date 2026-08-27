'use client'

import { useState } from 'react'
import Sidebar from './sidebar'
import Header from './header'
import { PasswordCheck } from '@/components/auth/password-check'
import { QuickAddLauncher } from '@/components/transactions/quick-add-launcher'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      {/* Check if user needs to set password */}
      <PasswordCheck />

      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar - Desktop */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <Header onMenuClick={() => setSidebarOpen(true)} />

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
              {children}
            </div>
          </main>

          {/* Mobile quick-add FAB (Phase 1) */}
          <QuickAddLauncher variant="fab" />
        </div>
      </div>
    </>
  )
}
