import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import './App.css'
import { AuthScreen } from './components/auth/AuthScreen'
import { ChangePasswordDialog } from './components/auth/ChangePasswordDialog'
import { AppShell } from './components/layout/AppShell'
import { CustomersPage } from './pages/CustomersPage'
import { DailySalesPage } from './pages/DailySalesPage'
import { ProductsPage } from './pages/ProductsPage'
import { ReceiptRegisterPage } from './pages/ReceiptRegisterPage'
import { DashboardPage } from './pages/DashboardPage'
import { BackupSettingsPage } from './pages/BackupSettingsPage'
import { authRepository, type AuthSession } from './repositories/authRepository'
import { repositoryError } from './repositories/tauriBridge'

export type AppPage = 'dashboard' | 'customers' | 'products' | 'dailySales' | 'receipts' | 'backup'

function App() {
  const [authMode, setAuthMode] = useState<'checking' | 'setup' | 'login'>('checking')
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard')
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const closeNavigation = useCallback(() => setNavigationOpen(false), [])

  const loadAuthStatus = useCallback(async () => {
    setAuthMode('checking'); setAuthError(null)
    try { const status = await authRepository.status(); setAuthMode(status.hasAccount ? 'login' : 'setup') }
    catch (reason) { setAuthMode('login'); setAuthError(repositoryError(reason)) }
  }, [])
  useEffect(() => { void loadAuthStatus() }, [loadAuthStatus])

  const endSession = useCallback(() => {
    setSession(null); setAuthMode('login'); setCurrentPage('dashboard'); setNavigationOpen(false); setChangingPassword(false)
  }, [])

  const handleRestore = useCallback(() => {
    setSession(null); setCurrentPage('dashboard'); setNavigationOpen(false); setChangingPassword(false); setPasswordChanged(false)
    void loadAuthStatus()
  }, [loadAuthStatus])

  if (authMode === 'checking') return <main className="auth-screen"><div className="auth-loading" role="status">جارٍ تهيئة الحساب المحلي...</div></main>
  if (!session) return <AuthScreen mode={authMode} startupError={authError} onAuthenticated={(next) => { setSession(next); setAuthError(null) }} onRetryStatus={() => void loadAuthStatus()} />

  return (
    <><AppShell
      currentPage={currentPage}
      username={session.username}
      isNavigationOpen={navigationOpen}
      onNavigate={setCurrentPage}
      onNavigationToggle={() => setNavigationOpen((open) => !open)}
      onNavigationClose={closeNavigation}
      onChangePassword={() => { setPasswordChanged(false); setChangingPassword(true); closeNavigation() }}
      onLogout={endSession}
    >
      {currentPage === 'dashboard' && <DashboardPage />}
      {currentPage === 'customers' && <CustomersPage />}
      {currentPage === 'products' && <ProductsPage />}
      {currentPage === 'dailySales' && <DailySalesPage />}
      {currentPage === 'receipts' && <ReceiptRegisterPage />}
      {currentPage === 'backup' && <BackupSettingsPage onRestored={handleRestore} />}
    </AppShell>
    {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} onChanged={() => { setChangingPassword(false); setPasswordChanged(true) }} />}
    {passwordChanged && <div className="toast" role="status"><span>تم تغيير كلمة المرور بنجاح.</span><button className="icon-button" type="button" onClick={() => setPasswordChanged(false)} aria-label="إغلاق"><X size={17} /></button></div>}
    </>
  )
}

export default App
