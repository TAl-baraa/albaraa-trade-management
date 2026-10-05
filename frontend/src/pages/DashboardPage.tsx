import { Archive, BookOpenText, CircleDollarSign, Coins, RefreshCw, ReceiptText, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SummaryCard } from '../components/customers/SummaryCard'
import { DailyActivitySummary } from '../components/dashboard/DailyActivitySummary'
import { DashboardSection } from '../components/dashboard/DashboardSection'
import { HighDebtCustomers } from '../components/dashboard/HighDebtCustomers'
import { RecentActivityList } from '../components/dashboard/RecentActivityList'
import { customerRepository } from '../repositories/customerRepository'
import { receiptRepository } from '../repositories/receiptRepository'
import { saleRepository } from '../repositories/saleRepository'
import { buildDashboardSummary, type DashboardSummary } from '../services/dashboardService'
import { getLocalDateString } from '../utils/date'
import { formatDate, formatNumber } from '../utils/formatters'
import './DashboardPage.css'

type DashboardState = { ok: true; summary: DashboardSummary } | { ok: false }

const loadDashboard = async (): Promise<DashboardState> => {
  try {
    return { ok: true, summary: buildDashboardSummary(await customerRepository.getAll(), saleRepository.getSnapshot(), receiptRepository.getSnapshot(), getLocalDateString()) }
  } catch {
    return { ok: false }
  }
}

export function DashboardPage() {
  const [state, setState] = useState<DashboardState>({ ok: false })
  const [loading, setLoading] = useState(true)
  const refresh = async () => { setLoading(true); setState(await loadDashboard()); setLoading(false) }
  useEffect(() => {
    let active = true
    const reload = async () => { const next = await loadDashboard(); if (active) { setState(next); setLoading(false) } }
    void reload()
    window.addEventListener('focus', reload)
    window.addEventListener('storage', reload)
    const interval = window.setInterval(reload, 60_000)
    return () => { active = false; window.removeEventListener('focus', reload); window.removeEventListener('storage', reload); window.clearInterval(interval) }
  }, [])

  return <div className="page-container dashboard-page">
    <header className="page-header"><div><span className="eyebrow">نظرة عامة على المكتب</span><h1>لوحة المتابعة</h1><p>ملخص المبيعات والواصل وأرصدة الزبائن — {formatDate(state.ok ? state.summary.today : getLocalDateString())}</p></div><button className="button button--secondary" type="button" onClick={refresh}><RefreshCw size={18} />تحديث</button></header>
    {loading ? <p role="status">جارٍ تحميل البيانات...</p> : !state.ok ? <p className="dashboard-error" role="alert">تعذر قراءة البيانات المحفوظة. لم تُغيّر أي بيانات. أعد المحاولة أو راجع السجلات قبل الاعتماد على الملخص.</p> : <>
      <div className="dashboard-grid">
        <DailyActivitySummary title="مبيعات اليوم" countLabel="عدد عمليات البيع" activity={state.summary.sales} icon={BookOpenText} />
        <DailyActivitySummary title="الواصل اليوم" countLabel="عدد عمليات الاستلام" activity={state.summary.receipts} icon={ReceiptText} />
      </div>
      <div className="dashboard-grid dashboard-grid--accounts">
        <DashboardSection title="الزبائن"><div className="dashboard-metrics"><SummaryCard label="الزبائن النشطون" value={formatNumber(state.summary.activeCustomers)} icon={Users} /><SummaryCard label="الزبائن المؤرشفون" value={formatNumber(state.summary.archivedCustomers)} icon={Archive} /></div></DashboardSection>
        <DashboardSection title="أرصدة الزبائن" description="تشمل جميع الزبائن، بما فيهم المؤرشفون. الديون والأرصدة الدائنة منفصلة.">
          <div className="dashboard-metrics dashboard-metrics--balances">
            <SummaryCard label="ديون للمكتب — بالدينار" value={`${formatNumber(state.summary.debt.IQD)} د.ع`} icon={Coins} tone="debt" />
            <SummaryCard label="ديون للمكتب — بالدولار" value={`${formatNumber(state.summary.debt.USD)} دولار`} icon={CircleDollarSign} tone="debt" />
            <SummaryCard label="أرصدة للزبائن — بالدينار" value={`${formatNumber(state.summary.credit.IQD)} د.ع`} icon={Coins} tone="credit" />
            <SummaryCard label="أرصدة للزبائن — بالدولار" value={`${formatNumber(state.summary.credit.USD)} دولار`} icon={CircleDollarSign} tone="credit" />
          </div>
        </DashboardSection>
      </div>
      <div className="dashboard-grid">
        <RecentActivityList title="أحدث المبيعات" items={state.summary.recentSales.map((sale) => ({ id: sale.id, date: sale.saleDate, customerName: sale.customerNameSnapshot, productName: sale.productNameSnapshot, amount: sale.totalAmount, currency: sale.saleCurrency }))} />
        <RecentActivityList title="أحدث الواصلات" items={state.summary.recentReceipts.map((receipt) => ({ id: receipt.id, date: receipt.businessDate, customerName: receipt.customerNameSnapshot, amount: receipt.amount, currency: receipt.currency }))} />
        <HighDebtCustomers currency="IQD" customers={state.summary.highDebtCustomers.IQD} />
        <HighDebtCustomers currency="USD" customers={state.summary.highDebtCustomers.USD} />
      </div>
    </>}
  </div>
}
