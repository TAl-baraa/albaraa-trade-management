import { Building2, Menu, Users, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  isNavigationOpen: boolean
  onNavigationToggle: () => void
  onNavigationClose: () => void
}

export function AppShell({ children, isNavigationOpen, onNavigationToggle, onNavigationClose }: AppShellProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isNavigationOpen) onNavigationClose()
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
        <button className="sidebar-close icon-button icon-button--light" type="button" onClick={onNavigationClose} aria-label="إغلاق قائمة التنقل"><X size={22} /></button>
        <div className="sidebar-brand">
          <div className="sidebar-brand__icon"><Building2 size={28} /></div>
          <div><strong>مكتب البراء لتجارة المواد الإنشائية</strong><span>نظام إدارة التجارة</span></div>
        </div>
        <nav><button className="nav-item nav-item--active" type="button" aria-current="page" onClick={onNavigationClose}><Users size={20} /><span>إدارة الزبائن</span></button></nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
