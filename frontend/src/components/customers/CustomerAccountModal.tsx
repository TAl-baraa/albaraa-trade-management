import { useRepositoryList } from '../../hooks/useRepositoryList'
import { RepositoryStatus } from '../common/RepositoryStatus'
import { FilePenLine, History, Printer, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { customerRepository } from '../../repositories/customerRepository'
import { productRepository } from '../../repositories/productRepository'
import { receiptRepository } from '../../repositories/receiptRepository'
import { saleRepository } from '../../repositories/saleRepository'
import { receiptAccountingService } from '../../services/receiptAccountingService'
import { buildCustomerStatement, buildStatementBalancePresentation, deriveInitialBalance, type StatementTransaction } from '../../services/customerStatementService'
import { salesAccountingService } from '../../services/salesAccountingService'
import type { Customer } from '../../types/customer'
import type { Currency } from '../../types/product'
import type { Receipt, ReceiptFormValues } from '../../types/receipt'
import type { Sale, SaleFormValues } from '../../types/sale'
import { formatDate, formatNumber } from '../../utils/formatters'
import { DeleteOperationDialog } from '../audit/DeleteOperationDialog'
import { OperationHistoryDialog } from '../audit/OperationHistoryDialog'
import { ReceiptRowEditor } from '../receipts/ReceiptRowEditor'
import { SaleRowEditor } from '../sales/SaleRowEditor'
import { Toast } from './Toast'
import { Modal } from './Modal'
import { PrintableCustomerStatement } from './PrintableCustomerStatement'

type Editable = { kind: 'sale'; record: Sale } | { kind: 'receipt'; record: Receipt }
const currencyLabel = (currency: Currency) => currency === 'IQD' ? 'الدينار العراقي (IQD)' : 'الدولار الأمريكي (USD)'

export function CustomerAccountModal({ customer: initialCustomer, onClose, onChanged }: { customer: Customer; onClose: () => void; onChanged: () => void }) {
  const [customer, setCustomer] = useState(initialCustomer)
  const { items: sales, setItems: setSales, loading: salesLoading, error: salesError, reload: reloadSales } = useRepositoryList(saleRepository.getAll)
  const { items: receipts, setItems: setReceipts, loading: receiptsLoading, error: receiptsError, reload: reloadReceipts } = useRepositoryList(receiptRepository.getAll)
  const [currency, setCurrency] = useState<Currency>('IQD')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [editing, setEditing] = useState<Editable | null>(null)
  const [deleting, setDeleting] = useState<Editable | null>(null)
  const [history, setHistory] = useState<Editable | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const { items: products, loading, error, reload } = useRepositoryList(productRepository.getAll)
  const { items: customers, loading: customersLoading, error: customersError, reload: reloadCustomers } = useRepositoryList(customerRepository.getAll)
  const [initialBalances, setInitialBalances] = useState<{ IQD: number; USD: number } | null>(null)
  useEffect(() => {
    if (!salesLoading && !receiptsLoading) setInitialBalances((current) => current ?? {
      IQD: deriveInitialBalance(initialCustomer.iqdBalance, initialCustomer.id, 'IQD', sales, receipts),
      USD: deriveInitialBalance(initialCustomer.usdBalance, initialCustomer.id, 'USD', sales, receipts),
    })
  }, [initialCustomer.id, initialCustomer.iqdBalance, initialCustomer.usdBalance, receipts, receiptsLoading, sales, salesLoading])
  const statement = useMemo(() => buildCustomerStatement({ customerId: customer.id, currency, sales, receipts, initialBalance: initialBalances?.[currency] ?? customer[currency === 'IQD' ? 'iqdBalance' : 'usdBalance'], startDate: startDate || null, endDate: endDate || null }), [currency, customer, endDate, initialBalances, receipts, sales, startDate])
  const refresh = (nextSales: Sale[], nextReceipts: Receipt[], nextCustomer?: Customer) => { setSales(nextSales); setReceipts(nextReceipts); if (nextCustomer) setCustomer(nextCustomer); onChanged() }
  const updateSale = async (record: Sale, values: SaleFormValues) => { const result = await salesAccountingService.update(record.id, values); if (!result.ok) { setToast(result.message); return false }; refresh(result.sales, receipts, result.customers.find((item) => item.id === customer.id)); setEditing(null); setToast('تم تعديل البيع في السجل الأصلي وتحديث الحساب.'); return true }
  const updateReceipt = async (record: Receipt, values: ReceiptFormValues) => { const result = await receiptAccountingService.update(record.id, values); if (!result.ok) { setToast(result.message); return false }; refresh(sales, result.receipts, result.customers.find((item) => item.id === customer.id)); setEditing(null); setToast('تم تعديل الواصل في السجل الأصلي وتحديث الحساب.'); return true }
  const confirmDelete = async (reason: string) => {
    if (!deleting) return
    if (deleting.kind === 'sale') {
      const result = await salesAccountingService.delete(deleting.record.id, reason)
      if (!result.ok) { setToast(result.message); return }
      refresh(result.sales, receipts, result.customers.find((item) => item.id === customer.id))
    } else {
      const result = await receiptAccountingService.delete(deleting.record.id, reason)
      if (!result.ok) { setToast(result.message); return }
      refresh(sales, result.receipts, result.customers.find((item) => item.id === customer.id))
    }
    setDeleting(null); setToast('تم حذف العملية من سجلها الأصلي وحفظها في المحذوفات.')
  }
  const editableFrom = (transaction: StatementTransaction): Editable => transaction.kind === 'sale' ? { kind: 'sale', record: transaction.record } : { kind: 'receipt', record: transaction.record }
  const actionButtons = (transaction: StatementTransaction) => <div className="statement-actions no-print"><button type="button" onClick={() => setEditing(editableFrom(transaction))}><FilePenLine size={15} />تعديل</button><button type="button" onClick={() => setHistory(editableFrom(transaction))}><History size={15} />السجل</button><button className="danger" type="button" onClick={() => setDeleting(editableFrom(transaction))}><Trash2 size={15} />حذف</button></div>
  return <><Modal title="حساب الزبون وكشف الحساب" onClose={onClose} size="large"><RepositoryStatus loading={loading || customersLoading || salesLoading || receiptsLoading} error={error || customersError || salesError || receiptsError} onRetry={() => { void reload(); void reloadCustomers(); void reloadSales(); void reloadReceipts() }} /><div className="account-toolbar screen-only"><div className="currency-switch" role="group" aria-label="عملة الحساب"><button className={currency === 'IQD' ? 'active' : ''} onClick={() => setCurrency('IQD')} type="button">IQD / الدينار</button><button className={currency === 'USD' ? 'active' : ''} onClick={() => setCurrency('USD')} type="button">USD / الدولار</button></div><div className="date-range"><label>من<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>إلى<input type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><button className="button button--secondary button--small" type="button" onClick={() => { setStartDate(''); setEndDate('') }}>كل الفترة</button></div><div className="statement-export"><button className="button button--secondary button--small" type="button" onClick={() => window.print()}><Printer size={17} />طباعة</button></div><p className="browser-print-note">عند استخدام طباعة المتصفح، عطّل خيار «الرؤوس والتذييلات» من نافذة الطباعة.</p></div>
    <div className="statement-document screen-only" dir="rtl"><header className="statement-header"><h2>كشف حساب الزبون: {customer.name}</h2><dl><div><dt>العملة</dt><dd>{currencyLabel(currency)}</dd></div><div><dt>الفترة</dt><dd>{startDate || endDate ? `من ${startDate ? formatDate(startDate) : 'بداية الحساب'} إلى ${endDate ? formatDate(endDate) : 'آخر عملية'}` : 'كل الفترة'}</dd></div><div><dt>تاريخ الإنشاء</dt><dd>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</dd></div></dl></header>
      {statement.sections.length === 0 ? <p className="empty-state">لا توجد عمليات ضمن الفترة المحددة، والحساب صفر.</p> : statement.sections.map((section, sectionIndex) => <section className="statement-section" key={section.id}>{sectionIndex === 0 && statement.dateRangeOpening && <div className={`statement-row ${statement.dateRangeOpening.kind === 'opening-credit' ? 'statement-row--receipt' : 'statement-row--debit'}`} data-calculated="true"><span>{statement.dateRangeOpening.kind === 'opening-debt' ? 'الرصيد السابق عليه' : 'الواصل من رصيد سابق'}</span><strong>{formatNumber(statement.dateRangeOpening.amount)} {currency}</strong></div>}{section.openingDebt > 0 && !(sectionIndex === 0 && statement.dateRangeOpening?.kind === 'opening-debt') && <div className="statement-row statement-row--debit"><span>الرصيد السابق عليه</span><strong>{formatNumber(section.openingDebt)} {currency}</strong></div>}{section.sales.map((transaction) => <div className="statement-row statement-row--transaction" key={transaction.id}><div><b>مبيعات — {formatDate(transaction.date)}</b><span>{transaction.record.productNameSnapshot}، الوزن {formatNumber(transaction.record.weightTons)} طن، سعر الطن {formatNumber(transaction.record.unitSalePrice)}، السائق {transaction.record.driverName}</span></div><strong>{formatNumber(transaction.amount)} {currency}</strong>{actionButtons(transaction)}</div>)}{(section.sales.length > 0 || section.openingDebt > 0) && <div className="statement-row statement-row--total"><span>مجموع المبيعات</span><strong>{formatNumber(section.salesTotal)} {currency}</strong></div>}{section.carriedCustomerCredit && !(sectionIndex === 0 && statement.dateRangeOpening?.kind === 'opening-credit') && <div className="statement-row statement-row--receipt" data-calculated="true"><span>الواصل من رصيد سابق</span><strong>{formatNumber(section.carriedCustomerCredit.amount)} {currency}</strong></div>}{section.receipts.map((transaction) => <div className="statement-row statement-row--transaction statement-row--receipt" key={transaction.id}><div><b>الواصل — {formatDate(transaction.date)}</b><span>{transaction.record.notes || 'لا توجد ملاحظات'}</span></div><strong>{formatNumber(transaction.amount)} {currency}</strong>{actionButtons(transaction)}</div>)}{buildStatementBalancePresentation(section.balance).map((row) => <div className={`statement-balance ${row.tone === 'red' ? 'credit' : ''}`} key={row.kind}><span>{row.label}</span><strong>{row.displayZero ? 'صفر' : `${formatNumber(row.amount)} ${currency}`}</strong></div>)}</section>)}</div>
    {editing && <Modal title={editing.kind === 'sale' ? 'تعديل البيع من حساب الزبون' : 'تعديل الواصل من حساب الزبون'} onClose={() => setEditing(null)}>{editing.kind === 'sale' ? <SaleRowEditor variant="card" sale={editing.record} customers={customers} products={products} selectedDate={editing.record.saleDate} onSave={(values) => updateSale(editing.record, values)} onCancel={() => setEditing(null)} /> : <ReceiptRowEditor variant="card" receipt={editing.record} customers={customers} selectedDate={editing.record.businessDate} onSave={(values) => updateReceipt(editing.record, values)} onCancel={() => setEditing(null)} />}</Modal>}
    {deleting && <DeleteOperationDialog title={deleting.kind === 'sale' ? 'تأكيد حذف البيع' : 'تأكيد حذف الواصل'} description="ستُحذف العملية من سجلها الأصلي ويُعكس أثرها المالي، مع الاحتفاظ بكامل تاريخها في سجل المحذوفات." onConfirm={confirmDelete} onClose={() => setDeleting(null)} />}
    {history && <OperationHistoryDialog title={history.kind === 'sale' ? 'سجل تغييرات البيع' : 'سجل تغييرات الواصل'} history={history.record.history} onClose={() => setHistory(null)} />}{toast && <Toast message={toast} onClose={() => setToast(null)} />}</Modal>{createPortal(<div className="print-only-source"><PrintableCustomerStatement customer={customer} statement={statement} /></div>, document.body)}</>
}
