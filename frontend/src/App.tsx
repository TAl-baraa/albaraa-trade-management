import { useCallback, useState } from 'react'
import './App.css'
import { AppShell } from './components/layout/AppShell'
import { CustomersPage } from './pages/CustomersPage'
import { ProductsPage } from './pages/ProductsPage'

export type AppPage = 'customers' | 'products'

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('customers')
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
      {currentPage === 'customers' ? <CustomersPage /> : <ProductsPage />}
    </AppShell>
  )
}

export default App
