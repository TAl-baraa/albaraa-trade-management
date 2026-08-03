import { Archive, CircleDollarSign, Coins, Plus, Search, Users, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import './App.css'
import { AppShell } from './components/layout/AppShell'
import { ConfirmationModal } from './components/customers/ConfirmationModal'
import { CustomerDetailsModal } from './components/customers/CustomerDetailsModal'
import { CustomerFormModal } from './components/customers/CustomerFormModal'
import { CustomerList } from './components/customers/CustomerList'
import { SummaryCard } from './components/customers/SummaryCard'
import { Toast } from './components/customers/Toast'
import { initialCustomers } from './data/mockCustomers'
import type { Customer, CustomerFormValues } from './types/customer'
import { formatNumber } from './utils/formatters'

type ViewMode = 'active' | 'archived'
type ConfirmationAction = { type: 'archive' | 'delete' | 'reactivate'; customer: Customer }

const signedBalance = (direction: CustomerFormValues['iqdDirection'], amount: string): number => {
  if (direction === 'settled') return 0
  const value = Number(amount)
  return direction === 'owesUs' ? value : -value
}

function App() {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [view, setView] = useState<ViewMode>('active')
  const [search, setSearch] = useState('')
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [detailsCustomer, setDetailsCustomer] = useState<Customer | null>(null)
  const [formCustomer, setFormCustomer] = useState<Customer | null | undefined>(undefined)
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const closeNavigation = useCallback(() => setNavigationOpen(false), [])
  const activeCustomers = useMemo(() => customers.filter((customer) => !customer.isArchived), [customers])
  const visibleCustomers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ar')
    return customers.filter((customer) => customer.isArchived === (view === 'archived') && (!normalizedSearch || customer.name.toLocaleLowerCase('ar').includes(normalizedSearch) || customer.phone.includes(normalizedSearch)))
  }, [customers, search, view])
  const totals = useMemo(() => activeCustomers.reduce((result, customer) => ({
    iqdOwedToUs: result.iqdOwedToUs + Math.max(customer.iqdBalance, 0), iqdWeOwe: result.iqdWeOwe + Math.abs(Math.min(customer.iqdBalance, 0)),
    usdOwedToUs: result.usdOwedToUs + Math.max(customer.usdBalance, 0), usdWeOwe: result.usdWeOwe + Math.abs(Math.min(customer.usdBalance, 0)),
  }), { iqdOwedToUs: 0, iqdWeOwe: 0, usdOwedToUs: 0, usdWeOwe: 0 }), [activeCustomers])

  const saveCustomer = (values: CustomerFormValues) => {
    const iqdBalance = signedBalance(values.iqdDirection, values.iqdAmount)
    const usdBalance = signedBalance(values.usdDirection, values.usdAmount)
    if (formCustomer) {
      setCustomers((current) => current.map((customer) => customer.id === formCustomer.id ? { ...customer, name: values.name, phone: values.phone, notes: values.notes, iqdBalance, usdBalance } : customer))
      setToast('تم حفظ تعديلات الزبون بنجاح.')
    } else {
      const newCustomer: Customer = { id: `customer-${Date.now()}`, name: values.name, phone: values.phone, notes: values.notes, iqdBalance, usdBalance, lastPurchaseDate: null, lastPaymentDate: null, hasTransactionHistory: false, isArchived: false, createdAt: new Date().toISOString().slice(0, 10), archivedAt: null }
      setCustomers((current) => [newCustomer, ...current])
      setView('active')
      setToast('تمت إضافة الزبون بنجاح.')
    }
    setFormCustomer(undefined)
  }

  const completeConfirmation = () => {
    if (!confirmation) return
    const { customer, type } = confirmation
    if (type === 'archive') {
      setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, isArchived: true, archivedAt: new Date().toISOString().slice(0, 10) } : item))
      setToast('تمت أرشفة الزبون بنجاح.')
    } else if (type === 'reactivate') {
      setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, isArchived: false, archivedAt: null } : item))
      setToast('تمت إعادة تفعيل الزبون بنجاح.')
    } else {
      setCustomers((current) => current.filter((item) => item.id !== customer.id))
      setToast('تم حذف الزبون نهائيًا.')
    }
    setConfirmation(null)
  }

  const confirmationContent = confirmation ? {
    archive: { title: 'تأكيد أرشفة الزبون', message: `سيُخفى حساب ${confirmation.customer.name} من قائمة الزبائن النشطين مع الحفاظ على جميع بياناته.`, label: 'أرشفة الزبون' },
    delete: { title: 'تأكيد الحذف النهائي', message: `سيُحذف حساب ${confirmation.customer.name} نهائيًا لأنه بلا رصيد ولا سجل معاملات. لا يمكن التراجع عن هذا الإجراء.`, label: 'حذف نهائي' },
    reactivate: { title: 'تأكيد إعادة التفعيل', message: `سيعود حساب ${confirmation.customer.name} إلى قائمة الزبائن النشطين مع الحفاظ على بياناته.`, label: 'إعادة التفعيل' },
  }[confirmation.type] : null

  return <AppShell isNavigationOpen={navigationOpen} onNavigationToggle={() => setNavigationOpen((open) => !open)} onNavigationClose={closeNavigation}>
    <div className="page-container">
      <header className="page-header"><div><span className="eyebrow">قسم المبيعات</span><h1>إدارة الزبائن</h1><p>إضافة الزبائن ومتابعة أرصدتهم وحالة حساباتهم</p></div><button className="button button--primary" type="button" onClick={() => setFormCustomer(null)}><Plus size={19} />إضافة زبون</button></header>
      <section className="summary-grid" aria-label="ملخص حسابات الزبائن">
        <SummaryCard label="الزبائن النشطون" value={formatNumber(activeCustomers.length)} icon={Users} />
        <SummaryCard label="لنا بالدينار" value={`${formatNumber(totals.iqdOwedToUs)} د.ع`} icon={Coins} tone="debt" />
        <SummaryCard label="علينا بالدينار" value={`${formatNumber(totals.iqdWeOwe)} د.ع`} icon={Coins} tone="credit" />
        <SummaryCard label="لنا بالدولار" value={`${formatNumber(totals.usdOwedToUs)} دولار`} icon={CircleDollarSign} tone="debt" />
        <SummaryCard label="علينا بالدولار" value={`${formatNumber(totals.usdWeOwe)} دولار`} icon={CircleDollarSign} tone="credit" />
      </section>
      <section className="customers-panel">
        <div className="toolbar"><div className="view-switch" role="group" aria-label="حالة الزبائن"><button type="button" className={view === 'active' ? 'active' : ''} onClick={() => { setView('active'); setSearch('') }}><Users size={17} />الزبائن النشطون</button><button type="button" className={view === 'archived' ? 'active' : ''} onClick={() => { setView('archived'); setSearch('') }}><Archive size={17} />الزبائن المؤرشفون</button></div>
          <label className="search-field"><span className="visually-hidden">البحث عن زبون</span><Search size={19} aria-hidden="true" /><input type="search" placeholder="ابحث بالاسم أو رقم الهاتف" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" onClick={() => setSearch('')} aria-label="مسح البحث"><X size={17} /></button>}</label></div>
        <CustomerList customers={visibleCustomers} archived={view === 'archived'} onOpen={setDetailsCustomer} onEdit={(customer) => setFormCustomer(customer)} onArchive={(customer) => setConfirmation({ type: 'archive', customer })} onDelete={(customer) => setConfirmation({ type: 'delete', customer })} onReactivate={(customer) => setConfirmation({ type: 'reactivate', customer })} />
      </section>
    </div>
    {detailsCustomer && <CustomerDetailsModal customer={customers.find((customer) => customer.id === detailsCustomer.id) ?? detailsCustomer} onClose={() => setDetailsCustomer(null)} />}
    {formCustomer !== undefined && <CustomerFormModal customer={formCustomer} onClose={() => setFormCustomer(undefined)} onSubmit={saveCustomer} />}
    {confirmation && confirmationContent && <ConfirmationModal title={confirmationContent.title} message={confirmationContent.message} confirmLabel={confirmationContent.label} destructive={confirmation.type === 'delete'} onConfirm={completeConfirmation} onClose={() => setConfirmation(null)} />}
    {toast && <Toast message={toast} onClose={() => setToast(null)} />}
  </AppShell>
}

export default App
