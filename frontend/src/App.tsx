import { useCallback, useState } from 'react'
import './App.css'
import { AppShell } from './components/layout/AppShell'
import { CustomersPage } from './pages/CustomersPage'
import { DailySalesPage } from './pages/DailySalesPage'
import { ProductsPage } from './pages/ProductsPage'
import { ReceiptRegisterPage } from './pages/ReceiptRegisterPage'
import { DashboardPage } from './pages/DashboardPage'

export type AppPage = 'dashboard' | 'customers' | 'products' | 'dailySales' | 'receipts'

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard')
  const [navigationOpen, setNavigationOpen] = useState(false)
  const closeNavigation = useCallback(() => setNavigationOpen(false), [])

  return (
    <AppShell
      currentPage={currentPage}
      isNavigationOpen={navigationOpen}
      onNavigate={setCurrentPage}
      onNavigationToggle={() => setNavigationOpen((open) => !open)}
      onNavigationClose={closeNavigation}
    >
      {currentPage === 'dashboard' && <DashboardPage />}
      {currentPage === 'customers' && <CustomersPage />}
      {currentPage === 'products' && <ProductsPage />}
      {currentPage === 'dailySales' && <DailySalesPage />}
      {currentPage === 'receipts' && <ReceiptRegisterPage />}
    </AppShell>
  )
}

export default App
