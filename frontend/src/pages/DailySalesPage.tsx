import { useMemo, useState } from 'react'
import { ConfirmationModal } from '../components/customers/ConfirmationModal'
import { Toast } from '../components/customers/Toast'
import { DailyDateNavigation } from '../components/sales/DailyDateNavigation'
import { SalesRegister } from '../components/sales/SalesRegister'
import { customerRepository } from '../repositories/customerRepository'
import { productRepository } from '../repositories/productRepository'
import { saleRepository } from '../repositories/saleRepository'
import { salesAccountingService } from '../services/salesAccountingService'
import type { Customer } from '../types/customer'
import type { Product } from '../types/product'
import type { Sale, SaleFormValues } from '../types/sale'
import { getLocalDateString, shiftLocalDate } from '../utils/date'
import { formatDate, formatNumber } from '../utils/formatters'

export function DailySalesPage() {
  const today = getLocalDateString()
  const [selectedDate, setSelectedDate] = useState(today)
  const [sales, setSales] = useState<Sale[]>(() => saleRepository.getAll())
  const [customers, setCustomers] = useState<Customer[]>(() => customerRepository.getAll())
  const [products] = useState<Product[]>(() => productRepository.getAll())
  const [deletingSale, setDeletingSale] = useState<Sale | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const dailySales = useMemo(() => sales.filter((sale) => sale.saleDate === selectedDate).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [sales, selectedDate])
  const createSale = (values: SaleFormValues): boolean => {
    const result = salesAccountingService.create(values)
    if (!result.ok) { setToast(result.message); return false }
    setSales(result.sales); setCustomers(result.customers)
    setToast('تم تسجيل البيع وإضافته إلى حساب الزبون بنجاح.')
    return true
  }
  const updateSale = (sale: Sale, values: SaleFormValues): boolean => {
    const result = salesAccountingService.update(sale.id, values)
    if (!result.ok) { setToast(result.message); return false }
    setSales(result.sales); setCustomers(result.customers); setToast('تم حفظ تعديلات البيع وتصحيح حساب الزبون بنجاح.')
    if (result.sale && result.sale.saleDate !== selectedDate) setSelectedDate(result.sale.saleDate)
    return true
  }
  const confirmDelete = () => {
    if (!deletingSale) return
    const result = salesAccountingService.delete(deletingSale.id)
    if (!result.ok) { setToast(result.message); setDeletingSale(null); return }
    setSales(result.sales); setCustomers(result.customers); setDeletingSale(null); setToast('تم حذف البيع وعكس أثره من حساب الزبون بنجاح.')
  }
  const changeDate = (date: string) => { if (date) setSelectedDate(date) }
  return (
    <div className="page-container sales-page">
      <header className="page-header"><div><span className="eyebrow">قسم المبيعات</span><h1>السجل اليومي للمبيعات</h1><p>تسجيل كل عملية بيع مستقلة ومتابعتها حسب تاريخ العمل.</p></div></header>
      <DailyDateNavigation selectedDate={selectedDate} today={today} onChange={changeDate} onPrevious={() => changeDate(shiftLocalDate(selectedDate, -1))} onNext={() => changeDate(shiftLocalDate(selectedDate, 1))} />
      <div className="register-heading"><div><h2>مبيعات يوم {formatDate(selectedDate)}</h2><span>{formatNumber(dailySales.length)} عملية بيع</span></div></div>
      <SalesRegister sales={dailySales} customers={customers} products={products} selectedDate={selectedDate} onCreate={createSale} onUpdate={updateSale} onDelete={setDeletingSale} />
      {deletingSale && <ConfirmationModal title="تأكيد حذف البيع" message={`سيُحذف بيع ${deletingSale.productNameSnapshot} للمشتري ${deletingSale.customerNameSnapshot} بوزن ${formatNumber(deletingSale.weightTons)} طن وإجمالي ${formatNumber(deletingSale.totalAmount)} ${deletingSale.saleCurrency} بتاريخ ${formatDate(deletingSale.saleDate)}، وسيُعكس أثره من حساب الزبون.`} confirmLabel="حذف البيع" destructive onConfirm={confirmDelete} onClose={() => setDeletingSale(null)} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
