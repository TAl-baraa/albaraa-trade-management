import { ArrowLeftRight, BookOpenText, Building2, DatabaseBackup, KeyRound, LayoutDashboard, LogOut, Menu, Package, ReceiptText, UserRound, Users } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import type { AppPage } from '../../App'

interface AppShellProps {
  children: ReactNode
  currentPage: AppPage
  username: string
  isNavigationOpen: boolean
  onNavigate: (page: AppPage) => void
  onNavigationToggle: () => void
  onNavigationClose: () => void
  onChangePassword: () => void
  onLogout: () => void
}

export function AppShell({ children, currentPage, username, isNavigationOpen, onNavigate, onNavigationToggle, onNavigationClose, onChangePassword, onLogout }: AppShellProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isNavigationOpen && !document.body.classList.contains('modal-open')) onNavigationClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isNavigationOpen, onNavigationClose])

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1409px)')
    const handleDesktopResize = (event: MediaQueryListEvent) => {
      if (event.matches) onNavigationClose()
    }

    desktopQuery.addEventListener('change', handleDesktopResize)
    return () => desktopQuery.removeEventListener('change', handleDesktopResize)
  }, [onNavigationClose])

  useEffect(() => {
    document.body.classList.toggle('drawer-open', isNavigationOpen)
    return () => document.body.classList.remove('drawer-open')
  }, [isNavigationOpen])

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button className="icon-button icon-button--light" type="button" onClick={onNavigationToggle} aria-label="فتح قائمة التنقل" aria-expanded={isNavigationOpen}>
          <Menu size={24} />
        </button>
        <span>نظام إدارة التجارة</span>
        <Building2 size={24} aria-hidden="true" />
      </header>
      {isNavigationOpen && <button className="drawer-backdrop" type="button" aria-label="إغلاق قائمة التنقل" onClick={onNavigationClose} />}
      <aside className={`sidebar ${isNavigationOpen ? 'sidebar--open' : ''}`} aria-label="التنقل الرئيسي">
        <div className="sidebar-brand">
          <div className="sidebar-brand__icon"><Building2 size={28} /></div>
          <div><strong>مكتب البراء لتجارة المواد الإنشائية</strong><span>نظام إدارة التجارة</span></div>
        </div>
        <nav>
          <button className={`nav-item ${currentPage === 'dashboard' ? 'nav-item--active' : ''}`} type="button" aria-current={currentPage === 'dashboard' ? 'page' : undefined} onClick={() => { onNavigate('dashboard'); onNavigationClose() }}><LayoutDashboard size={20} /><span>لوحة المتابعة</span></button>
          <button className={`nav-item ${currentPage === 'dailySales' ? 'nav-item--active' : ''}`} type="button" aria-current={currentPage === 'dailySales' ? 'page' : undefined} onClick={() => { onNavigate('dailySales'); onNavigationClose() }}><BookOpenText size={20} /><span>السجل اليومي للمبيعات</span></button>
          <button className={`nav-item ${currentPage === 'receipts' ? 'nav-item--active' : ''}`} type="button" aria-current={currentPage === 'receipts' ? 'page' : undefined} onClick={() => { onNavigate('receipts'); onNavigationClose() }}><ReceiptText size={20} /><span>سجل الواصل</span></button>
          <button className={`nav-item ${currentPage === 'transfers' ? 'nav-item--active' : ''}`} type="button" aria-current={currentPage === 'transfers' ? 'page' : undefined} onClick={() => { onNavigate('transfers'); onNavigationClose() }}><ArrowLeftRight size={20} /><span>سجل الحوالات</span></button>
          <button className={`nav-item ${currentPage === 'customers' ? 'nav-item--active' : ''}`} type="button" aria-current={currentPage === 'customers' ? 'page' : undefined} onClick={() => { onNavigate('customers'); onNavigationClose() }}><Users size={20} /><span>إدارة الزبائن</span></button>
          <button className={`nav-item ${currentPage === 'products' ? 'nav-item--active' : ''}`} type="button" aria-current={currentPage === 'products' ? 'page' : undefined} onClick={() => { onNavigate('products'); onNavigationClose() }}><Package size={20} /><span>إدارة المنتجات</span></button>
          <button className={`nav-item ${currentPage === 'backup' ? 'nav-item--active' : ''}`} type="button" aria-current={currentPage === 'backup' ? 'page' : undefined} onClick={() => { onNavigate('backup'); onNavigationClose() }}><DatabaseBackup size={20} /><span>النسخ الاحتياطي والاستعادة</span></button>
        </nav>
        <div className="sidebar-session"><div className="sidebar-session__user"><UserRound size={18} /><span><small>المستخدم الحالي</small><strong>{username}</strong></span></div><button type="button" onClick={onChangePassword}><KeyRound size={18} />تغيير كلمة المرور</button><button type="button" onClick={onLogout}><LogOut size={18} />تسجيل الخروج</button></div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
