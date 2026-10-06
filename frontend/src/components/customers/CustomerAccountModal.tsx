import { useRepositoryList } from '../../hooks/useRepositoryList'
import { RepositoryStatus } from '../common/RepositoryStatus'
import { FilePenLine, History, MessageCircle, Printer, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { customerRepository } from '../../repositories/customerRepository'
import { productRepository } from '../../repositories/productRepository'
import { receiptRepository } from '../../repositories/receiptRepository'
import { saleRepository } from '../../repositories/saleRepository'
import { transferRepository } from '../../repositories/transferRepository'
import { statementPdfRepository } from '../../repositories/statementPdfRepository'
import { repositoryError } from '../../repositories/tauriBridge'
import { receiptAccountingService } from '../../services/receiptAccountingService'
import { buildCustomerStatement, buildStatementBalancePresentation, deriveInitialBalance, type StatementTransaction } from '../../services/customerStatementService'
import { salesAccountingService } from '../../services/salesAccountingService'
import { transferAccountingService } from '../../services/transferAccountingService'
import type { Customer } from '../../types/customer'
import type { Currency } from '../../types/product'
import type { Receipt, ReceiptFormValues } from '../../types/receipt'
import type { Sale, SaleFormValues } from '../../types/sale'
import type { Transfer, TransferFormValues } from '../../types/transfer'
import { formatDate, formatNumber } from '../../utils/formatters'
import { DeleteOperationDialog } from '../audit/DeleteOperationDialog'
import { OperationHistoryDialog } from '../audit/OperationHistoryDialog'
import { ReceiptRowEditor } from '../receipts/ReceiptRowEditor'
import { SaleRowEditor } from '../sales/SaleRowEditor'
import { TransferRowEditor } from '../transfers/TransferRowEditor'
import { Toast } from './Toast'
import { Modal } from './Modal'
import { PrintableCustomerStatement } from './PrintableCustomerStatement'

type Editable = { kind: 'sale'; record: Sale } | { kind: 'receipt'; record: Receipt } | { kind: 'transfer'; record: Transfer }
const currencyLabel = (currency: Currency) => currency === 'IQD' ? 'الدينار العراقي (IQD)' : 'الدولار الأمريكي (USD)'

export function CustomerAccountModal({ customer: initialCustomer, onClose, onChanged }: { customer: Customer; onClose: () => void; onChanged: () => void }) {
  const [customer, setCustomer] = useState(initialCustomer)
  const { items: sales, setItems: setSales, loading: salesLoading, error: salesError, reload: reloadSales } = useRepositoryList(saleRepository.getAll)
  const { items: receipts, setItems: setReceipts, loading: receiptsLoading, error: receiptsError, reload: reloadReceipts } = useRepositoryList(receiptRepository.getAll)
  const { items: transfers, setItems: setTransfers, loading: transfersLoading, error: transfersError, reload: reloadTransfers } = useRepositoryList(transferRepository.getAll)
  const [currency, setCurrency] = useState<Currency>('IQD')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [editing, setEditing] = useState<Editable | null>(null)
  const [deleting, setDeleting] = useState<Editable | null>(null)
  const [history, setHistory] = useState<Editable | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sharingStatement, setSharingStatement] = useState(false)
  const { items: products, loading, error, reload } = useRepositoryList(productRepository.getAll)
  const { items: customers, loading: customersLoading, error: customersError, reload: reloadCustomers } = useRepositoryList(customerRepository.getAll)
  const [initialBalances, setInitialBalances] = useState<{ IQD: number; USD: number } | null>(null)
  useEffect(() => {
    if (!salesLoading && !receiptsLoading && !transfersLoading) setInitialBalances((current) => current ?? {
      IQD: deriveInitialBalance(initialCustomer.iqdBalance, initialCustomer.id, 'IQD', sales, receipts, transfers),
      USD: deriveInitialBalance(initialCustomer.usdBalance, initialCustomer.id, 'USD', sales, receipts, transfers),
    })
  }, [initialCustomer.id, initialCustomer.iqdBalance, initialCustomer.usdBalance, receipts, receiptsLoading, sales, salesLoading, transfers, transfersLoading])
  const statement = useMemo(() => buildCustomerStatement({ customerId: customer.id, currency, sales, receipts, transfers, initialBalance: initialBalances?.[currency] ?? customer[currency === 'IQD' ? 'iqdBalance' : 'usdBalance'], startDate: startDate || null, endDate: endDate || null }), [currency, customer, endDate, initialBalances, receipts, sales, startDate, transfers])
  const refresh = (nextSales: Sale[], nextReceipts: Receipt[], nextTransfers: Transfer[], nextCustomer?: Customer) => { setSales(nextSales); setReceipts(nextReceipts); setTransfers(nextTransfers); if (nextCustomer) setCustomer(nextCustomer); onChanged() }
  const updateSale = async (record: Sale, values: SaleFormValues) => { const result = await salesAccountingService.update(record.id, values); if (!result.ok) { setToast(result.message); return false }; refresh(result.sales, receipts, transfers, result.customers.find((item) => item.id === customer.id)); setEditing(null); setToast('تم تعديل البيع في السجل الأصلي وتحديث الحساب.'); return true }
  const updateReceipt = async (record: Receipt, values: ReceiptFormValues) => { const result = await receiptAccountingService.update(record.id, values); if (!result.ok) { setToast(result.message); return false }; refresh(sales, result.receipts, transfers, result.customers.find((item) => item.id === customer.id)); setEditing(null); setToast('تم تعديل الواصل في السجل الأصلي وتحديث الحساب.'); return true }
  const updateTransfer = async (record: Transfer, values: TransferFormValues) => { const result = await transferAccountingService.update(record.id, values); if (!result.ok) { setToast(result.message); return false }; refresh(sales, receipts, result.transfers, result.customers.find((item) => item.id === customer.id)); setEditing(null); setToast('تم تعديل الحوالة في السجل الأصلي وتحديث الحساب.'); return true }
  const confirmDelete = async (reason: string) => {
    if (!deleting) return
    if (deleting.kind === 'sale') {
      const result = await salesAccountingService.delete(deleting.record.id, reason)
      if (!result.ok) { setToast(result.message); return }
      refresh(result.sales, receipts, transfers, result.customers.find((item) => item.id === customer.id))
    } else if (deleting.kind === 'receipt') {
      const result = await receiptAccountingService.delete(deleting.record.id, reason)
      if (!result.ok) { setToast(result.message); return }
      refresh(sales, result.receipts, transfers, result.customers.find((item) => item.id === customer.id))
    } else {
      const result = await transferAccountingService.delete(deleting.record.id, reason)
      if (!result.ok) { setToast(result.message); return }
      refresh(sales, receipts, result.transfers, result.customers.find((item) => item.id === customer.id))
    }
    setDeleting(null); setToast('تم حذف العملية من سجلها الأصلي وحفظها في المحذوفات.')
  }
  const editableFrom = (transaction: StatementTransaction): Editable => transaction.kind === 'sale' ? { kind: 'sale', record: transaction.record } : transaction.kind === 'receipt' ? { kind: 'receipt', record: transaction.record } : { kind: 'transfer', record: transaction.record }
  const actionButtons = (transaction: StatementTransaction) => <div className="statement-actions no-print"><button type="button" onClick={() => setEditing(editableFrom(transaction))}><FilePenLine size={15} />تعديل</button><button type="button" onClick={() => setHistory(editableFrom(transaction))}><History size={15} />السجل</button><button className="danger" type="button" onClick={() => setDeleting(editableFrom(transaction))}><Trash2 size={15} />حذف</button></div>
  const shareStatement = async () => {
    setSharingStatement(true); setToast(null)
    try {
      await document.fonts.ready
      const pdf = await statementPdfRepository.share(customer.name)
      if (!pdf.shareOpened) {
        await statementPdfRepository.open(pdf.path)
        setToast(`${pdf.warning ?? 'نافذة مشاركة Windows غير متاحة.'} تم فتح ملف PDF ويمكنك حفظه أو مشاركته يدويًا.`)
        return
      }
      setToast('تم فتح نافذة مشاركة Windows. اختر واتساب؛ وإذا لم يظهر، يمكنك اختيار تطبيق PDF لحفظ الملف أو مشاركته يدويًا.')
    } catch (reason) { setToast(repositoryError(reason)) }
    finally { setSharingStatement(false) }
  }
  return <><Modal title="حساب الزبون وكشف الحساب" onClose={onClose} size="large"><RepositoryStatus loading={loading || customersLoading || salesLoading || receiptsLoading || transfersLoading} error={error || customersError || salesError || receiptsError || transfersError} onRetry={() => { void reload(); void reloadCustomers(); void reloadSales(); void reloadReceipts(); void reloadTransfers() }} /><div className="account-toolbar screen-only"><div className="currency-switch" role="group" aria-label="عملة الحساب"><button className={currency === 'IQD' ? 'active' : ''} onClick={() => setCurrency('IQD')} type="button">IQD / الدينار</button><button className={currency === 'USD' ? 'active' : ''} onClick={() => setCurrency('USD')} type="button">USD / الدولار</button></div><div className="date-range"><label>من<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>إلى<input type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><button className="button button--secondary button--small" type="button" onClick={() => { setStartDate(''); setEndDate('') }}>كل الفترة</button></div><div className="statement-export"><button className="button button--secondary button--small" type="button" onClick={() => window.print()}><Printer size={17} />طباعة</button><button className="button button--secondary button--small" type="button" onClick={() => void shareStatement()} disabled={sharingStatement}><MessageCircle size={17} />{sharingStatement ? 'جارٍ إنشاء PDF...' : 'إرسال عبر واتساب'}</button></div><p className="browser-print-note">عند استخدام طباعة المتصفح، عطّل خيار «الرؤوس والتذييلات» من نافذة الطباعة.</p></div>
    <div className="statement-document screen-only" dir="rtl"><header className="statement-header"><h2>كشف حساب الزبون: {customer.name}</h2><dl><div><dt>العملة</dt><dd>{currencyLabel(currency)}</dd></div><div><dt>الفترة</dt><dd>{startDate || endDate ? `من ${startDate ? formatDate(startDate) : 'بداية الحساب'} إلى ${endDate ? formatDate(endDate) : 'آخر عملية'}` : 'كل الفترة'}</dd></div><div><dt>تاريخ الإنشاء</dt><dd>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</dd></div></dl></header>
      {statement.sections.length === 0 ? <p className="empty-state">لا توجد عمليات ضمن الفترة المحددة، والحساب صفر.</p> : statement.sections.map((section, sectionIndex) => <section className="statement-section" key={section.id}>{sectionIndex === 0 && statement.dateRangeOpening && <div className={`statement-row ${statement.dateRangeOpening.kind === 'opening-credit' ? 'statement-row--receipt' : 'statement-row--debit'}`} data-calculated="true"><span>{statement.dateRangeOpening.kind === 'opening-debt' ? 'الرصيد السابق عليه' : 'الواصل من رصيد سابق'}</span><strong>{formatNumber(statement.dateRangeOpening.amount)} {currency}</strong></div>}{section.openingDebt > 0 && !(sectionIndex === 0 && statement.dateRangeOpening?.kind === 'opening-debt') && <div className="statement-row statement-row--debit"><span>الرصيد السابق عليه</span><strong>{formatNumber(section.openingDebt)} {currency}</strong></div>}{section.debits.map((transaction) => <div className="statement-row statement-row--transaction" key={transaction.id}><div>{transaction.kind === 'sale' ? <><b>مبيعات — {formatDate(transaction.date)}</b><span>{transaction.record.productNameSnapshot}، الوزن {formatNumber(transaction.record.weightTons)} طن، سعر الطن {formatNumber(transaction.record.unitSalePrice)}، السائق {transaction.record.driverName}</span></> : <><b>حوالة — {formatDate(transaction.date)}</b><span>{transaction.record.description}{transaction.record.notes ? ` — ${transaction.record.notes}` : ''}</span></>}</div><strong>{formatNumber(transaction.amount)} {currency}</strong>{actionButtons(transaction)}</div>)}{(section.debits.length > 0 || section.openingDebt > 0) && <div className="statement-row statement-row--total"><span>مجموع المبالغ المدينة</span><strong>{formatNumber(section.debitTotal)} {currency}</strong></div>}{section.carriedCustomerCredit && !(sectionIndex === 0 && statement.dateRangeOpening?.kind === 'opening-credit') && <div className="statement-row statement-row--receipt" data-calculated="true"><span>الواصل من رصيد سابق</span><strong>{formatNumber(section.carriedCustomerCredit.amount)} {currency}</strong></div>}{section.receipts.map((transaction) => <div className="statement-row statement-row--transaction statement-row--receipt" key={transaction.id}><div><b>الواصل — {formatDate(transaction.date)}</b><span>{transaction.record.notes || 'لا توجد ملاحظات'}</span></div><strong>{formatNumber(transaction.amount)} {currency}</strong>{actionButtons(transaction)}</div>)}{buildStatementBalancePresentation(section.balance).map((row) => <div className={`statement-balance ${row.tone === 'red' ? 'credit' : ''}`} key={row.kind}><span>{row.label}</span><strong>{row.displayZero ? 'صفر' : `${formatNumber(row.amount)} ${currency}`}</strong></div>)}</section>)}</div>
    {editing && <Modal title={editing.kind === 'sale' ? 'تعديل البيع من حساب الزبون' : editing.kind === 'receipt' ? 'تعديل الواصل من حساب الزبون' : 'تعديل الحوالة من حساب الزبون'} onClose={() => setEditing(null)}>{editing.kind === 'sale' ? <SaleRowEditor variant="card" sale={editing.record} customers={customers} products={products} selectedDate={editing.record.saleDate} onSave={(values) => updateSale(editing.record, values)} onCancel={() => setEditing(null)} /> : editing.kind === 'receipt' ? <ReceiptRowEditor variant="card" receipt={editing.record} customers={customers} selectedDate={editing.record.businessDate} onSave={(values) => updateReceipt(editing.record, values)} onCancel={() => setEditing(null)} /> : <TransferRowEditor variant="card" transfer={editing.record} customers={customers} selectedDate={editing.record.businessDate} onSave={(values) => updateTransfer(editing.record, values)} onCancel={() => setEditing(null)} />}</Modal>}
    {deleting && <DeleteOperationDialog title={deleting.kind === 'sale' ? 'تأكيد حذف البيع' : deleting.kind === 'receipt' ? 'تأكيد حذف الواصل' : 'تأكيد حذف الحوالة'} description="ستُحذف العملية من سجلها الأصلي ويُعكس أثرها المالي، مع الاحتفاظ بكامل تاريخها في سجل المحذوفات." onConfirm={confirmDelete} onClose={() => setDeleting(null)} />}
    {history && <OperationHistoryDialog title={history.kind === 'sale' ? 'سجل تغييرات البيع' : history.kind === 'receipt' ? 'سجل تغييرات الواصل' : 'سجل تغييرات الحوالة'} history={history.record.history} onClose={() => setHistory(null)} />}{toast && <Toast message={toast} onClose={() => setToast(null)} />}</Modal>{createPortal(<div className="print-only-source"><PrintableCustomerStatement customer={customer} statement={statement} /></div>, document.body)}</>
}
