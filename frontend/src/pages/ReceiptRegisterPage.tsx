import { useRepositoryList } from '../hooks/useRepositoryList'
import { RepositoryStatus } from '../components/common/RepositoryStatus'
import { Archive } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DeleteOperationDialog } from '../components/audit/DeleteOperationDialog'
import { DeletedRecordsDialog } from '../components/audit/DeletedRecordsDialog'
import { OperationHistoryDialog } from '../components/audit/OperationHistoryDialog'
import { Toast } from '../components/customers/Toast'
import { ReceiptRegister } from '../components/receipts/ReceiptRegister'
import { DailyDateNavigation } from '../components/sales/DailyDateNavigation'
import { customerRepository } from '../repositories/customerRepository'
import { receiptRepository } from '../repositories/receiptRepository'
import { receiptAccountingService } from '../services/receiptAccountingService'
import type { Receipt, ReceiptFormValues } from '../types/receipt'
import { getLocalDateString, shiftLocalDate } from '../utils/date'
import { formatDate, formatNumber } from '../utils/formatters'

export function ReceiptRegisterPage() {
  const today = getLocalDateString(); const [selectedDate, setSelectedDate] = useState(today)
  const [receipts, setReceipts] = useState(() => receiptRepository.getAll()); const { items: customers, setItems: setCustomers, loading, error, reload } = useRepositoryList(customerRepository.getAll)
  const [deleting, setDeleting] = useState<Receipt | null>(null); const [history, setHistory] = useState<Receipt | null>(null); const [showDeleted, setShowDeleted] = useState(false); const [toast, setToast] = useState<string | null>(null)
  const daily = useMemo(() => receipts.filter((receipt) => !receipt.isDeleted && receipt.businessDate === selectedDate).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [receipts, selectedDate])
  const create = async (values: ReceiptFormValues) => { const result = await receiptAccountingService.create(values); if (!result.ok) { setToast(result.message); return false }; setReceipts(result.receipts); setCustomers(result.customers); setToast('تم تسجيل الواصل وتحديث حساب الزبون بنجاح.'); return true }
  const update = async (receipt: Receipt, values: ReceiptFormValues) => { const result = await receiptAccountingService.update(receipt.id, values); if (!result.ok) { setToast(result.message); return false }; setReceipts(result.receipts); setCustomers(result.customers); setToast('تم تعديل الواصل وتصحيح حساب الزبون بنجاح.'); if (result.receipt && result.receipt.businessDate !== selectedDate) setSelectedDate(result.receipt.businessDate); return true }
  const remove = async (reason: string) => { if (!deleting) return; const result = await receiptAccountingService.delete(deleting.id, reason); if (!result.ok) { setToast(result.message); setDeleting(null); return }; setReceipts(result.receipts); setCustomers(result.customers); setDeleting(null); setToast('تم حذف الواصل وعكس أثره من حساب الزبون بنجاح.') }
  return <div className="page-container sales-page"><header className="page-header"><div><span className="eyebrow">حسابات الزبائن</span><h1>سجل الواصل</h1><p>تسجيل المبالغ المستلمة من الزبائن ومتابعتها حسب تاريخ العمل.</p></div><button className="button button--secondary" type="button" onClick={() => setShowDeleted(true)}><Archive size={18} />المحذوفات</button></header><DailyDateNavigation selectedDate={selectedDate} today={today} onChange={(date) => date && setSelectedDate(date)} onPrevious={() => setSelectedDate(shiftLocalDate(selectedDate, -1))} onNext={() => setSelectedDate(shiftLocalDate(selectedDate, 1))} /><div className="register-heading"><div><h2>واصلات يوم {formatDate(selectedDate)}</h2><span>{formatNumber(daily.length)} عملية استلام</span></div></div><RepositoryStatus loading={loading} error={error} onRetry={() => { void reload();  }} /><ReceiptRegister receipts={daily} customers={customers} selectedDate={selectedDate} onCreate={create} onUpdate={update} onDelete={setDeleting} onHistory={setHistory} />{deleting && <DeleteOperationDialog title="تأكيد حذف الواصل" description={`سيُحذف واصل الزبون ${deleting.customerNameSnapshot} بمبلغ ${formatNumber(deleting.amount)} ${deleting.currency}، وسيُعكس أثره من حساب الزبون.`} onConfirm={remove} onClose={() => setDeleting(null)} />}{history && <OperationHistoryDialog title="سجل تغييرات الواصل" history={history.history} onClose={() => setHistory(null)} />}{showDeleted && <DeletedRecordsDialog title="الواصلات المحذوفة" records={receipts.filter((receipt) => receipt.isDeleted).map((record) => ({ kind: 'receipt', record }))} onHistory={(record) => { setShowDeleted(false); setHistory(record as Receipt) }} onClose={() => setShowDeleted(false)} />}{toast && <Toast message={toast} onClose={() => setToast(null)} />}</div>
}
