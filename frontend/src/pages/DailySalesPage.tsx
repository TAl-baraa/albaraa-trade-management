import { useRepositoryList } from '../hooks/useRepositoryList'
import { RepositoryStatus } from '../components/common/RepositoryStatus'
import { useMemo, useState } from 'react'
import { Archive } from 'lucide-react'
import { DeleteOperationDialog } from '../components/audit/DeleteOperationDialog'
import { DeletedRecordsDialog } from '../components/audit/DeletedRecordsDialog'
import { OperationHistoryDialog } from '../components/audit/OperationHistoryDialog'
import { Toast } from '../components/customers/Toast'
import { DailyDateNavigation } from '../components/sales/DailyDateNavigation'
import { SalesRegister } from '../components/sales/SalesRegister'
import { customerRepository } from '../repositories/customerRepository'
import { productRepository } from '../repositories/productRepository'
import { saleRepository } from '../repositories/saleRepository'
import { salesAccountingService } from '../services/salesAccountingService'
import type { Sale, SaleFormValues } from '../types/sale'
import { getLocalDateString, shiftLocalDate } from '../utils/date'
import { formatDate, formatNumber } from '../utils/formatters'
import { buildDriverNameSuggestions } from '../utils/driverNames'

export function DailySalesPage() {
  const today = getLocalDateString()
  const [selectedDate, setSelectedDate] = useState(today)
  const { items: sales, setItems: setSales, loading: salesLoading, error: salesError, reload: reloadSales } = useRepositoryList(saleRepository.getAll)
  const { items: customers, setItems: setCustomers, loading, error, reload } = useRepositoryList(customerRepository.getAll)
  const { items: products, loading: productsLoading, error: productsError, reload: reloadProducts } = useRepositoryList(productRepository.getAll)
  const [deletingSale, setDeletingSale] = useState<Sale | null>(null)
  const [historySale, setHistorySale] = useState<Sale | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const dailySales = useMemo(() => sales.filter((sale) => !sale.isDeleted && sale.saleDate === selectedDate).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [sales, selectedDate])
  const driverNames = useMemo(() => buildDriverNameSuggestions(sales.map((sale) => sale.driverName)), [sales])
  const createSale = async (values: SaleFormValues): Promise<boolean> => {
    const result = await salesAccountingService.create(values)
    if (!result.ok) { setToast(result.message); return false }
    setSales(result.sales); setCustomers(result.customers)
    setToast('تم تسجيل البيع وإضافته إلى حساب الزبون بنجاح.')
    return true
  }
  const updateSale = async (sale: Sale, values: SaleFormValues): Promise<boolean> => {
    const result = await salesAccountingService.update(sale.id, values)
    if (!result.ok) { setToast(result.message); return false }
    setSales(result.sales); setCustomers(result.customers); setToast('تم حفظ تعديلات البيع وتصحيح حساب الزبون بنجاح.')
    if (result.sale && result.sale.saleDate !== selectedDate) setSelectedDate(result.sale.saleDate)
    return true
  }
  const confirmDelete = async (reason: string) => {
    if (!deletingSale) return
    const result = await salesAccountingService.delete(deletingSale.id, reason)
    if (!result.ok) { setToast(result.message); setDeletingSale(null); return }
    setSales(result.sales); setCustomers(result.customers); setDeletingSale(null); setToast('تم حذف البيع وعكس أثره من حساب الزبون بنجاح.')
  }
  const changeDate = (date: string) => { if (date) setSelectedDate(date) }
  const toggleReview = async (sale: Sale) => { const result = await salesAccountingService.toggleReviewed(sale.id); if (!result.ok) { setToast(result.message); return }; setSales(result.sales) }
  return (
    <div className="page-container sales-page">
      <header className="page-header"><div><span className="eyebrow">قسم المبيعات</span><h1>السجل اليومي للمبيعات</h1><p>تسجيل كل عملية بيع مستقلة ومتابعتها حسب تاريخ العمل.</p></div><button className="button button--secondary" type="button" onClick={() => setShowDeleted(true)}><Archive size={18} />المحذوفات</button></header>
      <DailyDateNavigation selectedDate={selectedDate} today={today} onChange={changeDate} onPrevious={() => changeDate(shiftLocalDate(selectedDate, -1))} onNext={() => changeDate(shiftLocalDate(selectedDate, 1))} />
      <div className="register-heading"><div><h2>مبيعات يوم {formatDate(selectedDate)}</h2><span>{formatNumber(dailySales.length)} عملية بيع</span></div></div>
      <RepositoryStatus loading={loading || productsLoading || salesLoading} error={error || productsError || salesError} onRetry={() => { void reload(); void reloadProducts(); void reloadSales() }} /><SalesRegister sales={dailySales} customers={customers} products={products} driverNames={driverNames} selectedDate={selectedDate} onCreate={createSale} onUpdate={updateSale} onDelete={setDeletingSale} onHistory={setHistorySale} onReview={toggleReview} />
      {deletingSale && <DeleteOperationDialog title="تأكيد حذف البيع" description={`سيُحذف بيع ${deletingSale.productNameSnapshot} للمشتري ${deletingSale.customerNameSnapshot} بوزن ${formatNumber(deletingSale.weightTons)} طن وإجمالي ${formatNumber(deletingSale.totalAmount)} ${deletingSale.saleCurrency} بتاريخ ${formatDate(deletingSale.saleDate)}، وسيُعكس أثره من حساب الزبون.`} onConfirm={confirmDelete} onClose={() => setDeletingSale(null)} />}
      {historySale && <OperationHistoryDialog title="سجل تغييرات البيع" history={historySale.history} onClose={() => setHistorySale(null)} />}
      {showDeleted && <DeletedRecordsDialog title="المبيعات المحذوفة" records={sales.filter((sale) => sale.isDeleted).map((record) => ({ kind: 'sale', record }))} onHistory={(record) => { setShowDeleted(false); setHistorySale(record as Sale) }} onClose={() => setShowDeleted(false)} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
