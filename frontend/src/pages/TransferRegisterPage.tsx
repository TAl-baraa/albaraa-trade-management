import { useRepositoryList } from '../hooks/useRepositoryList'
import { RepositoryStatus } from '../components/common/RepositoryStatus'
import { Archive } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DeleteOperationDialog } from '../components/audit/DeleteOperationDialog'
import { DeletedRecordsDialog } from '../components/audit/DeletedRecordsDialog'
import { OperationHistoryDialog } from '../components/audit/OperationHistoryDialog'
import { Toast } from '../components/customers/Toast'
import { TransferRegister } from '../components/transfers/TransferRegister'
import { DailyDateNavigation } from '../components/sales/DailyDateNavigation'
import { customerRepository } from '../repositories/customerRepository'
import { transferRepository } from '../repositories/transferRepository'
import { transferAccountingService } from '../services/transferAccountingService'
import type { Transfer, TransferFormValues } from '../types/transfer'
import { getLocalDateString, shiftLocalDate } from '../utils/date'
import { formatDate, formatNumber } from '../utils/formatters'

export function TransferRegisterPage() {
  const today = getLocalDateString(); const [selectedDate, setSelectedDate] = useState(today)
  const { items: transfers, setItems: setTransfers, loading: transfersLoading, error: transfersError, reload: reloadTransfers } = useRepositoryList(transferRepository.getAll); const { items: customers, setItems: setCustomers, loading, error, reload } = useRepositoryList(customerRepository.getAll)
  const [deleting, setDeleting] = useState<Transfer | null>(null); const [history, setHistory] = useState<Transfer | null>(null); const [showDeleted, setShowDeleted] = useState(false); const [toast, setToast] = useState<string | null>(null)
  const daily = useMemo(() => transfers.filter((transfer) => !transfer.isDeleted && transfer.businessDate === selectedDate).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [transfers, selectedDate])
  const create = async (values: TransferFormValues) => { const result = await transferAccountingService.create(values); if (!result.ok) { setToast(result.message); return false }; setTransfers(result.transfers); setCustomers(result.customers); setToast('تم تسجيل الحوالة وتحديث حساب الزبون بنجاح.'); return true }
  const update = async (transfer: Transfer, values: TransferFormValues) => { const result = await transferAccountingService.update(transfer.id, values); if (!result.ok) { setToast(result.message); return false }; setTransfers(result.transfers); setCustomers(result.customers); setToast('تم تعديل الحوالة وتصحيح حساب الزبون بنجاح.'); if (result.transfer && result.transfer.businessDate !== selectedDate) setSelectedDate(result.transfer.businessDate); return true }
  const remove = async (reason: string) => { if (!deleting) return; const result = await transferAccountingService.delete(deleting.id, reason); if (!result.ok) { setToast(result.message); setDeleting(null); return }; setTransfers(result.transfers); setCustomers(result.customers); setDeleting(null); setToast('تم حذف الحوالة وعكس أثره من حساب الزبون بنجاح.') }
  return <div className="page-container sales-page"><header className="page-header"><div><span className="eyebrow">حسابات الزبائن</span><h1>سجل الحوالات</h1><p>تسجيل المبالغ المرسلة إلى الزبائن ومتابعتها حسب تاريخ العمل.</p></div><button className="button button--secondary" type="button" onClick={() => setShowDeleted(true)}><Archive size={18} />المحذوفات</button></header><DailyDateNavigation selectedDate={selectedDate} today={today} onChange={(date) => date && setSelectedDate(date)} onPrevious={() => setSelectedDate(shiftLocalDate(selectedDate, -1))} onNext={() => setSelectedDate(shiftLocalDate(selectedDate, 1))} /><div className="register-heading"><div><h2>حوالات يوم {formatDate(selectedDate)}</h2><span>{formatNumber(daily.length)} حوالة</span></div></div><RepositoryStatus loading={loading || transfersLoading} error={error || transfersError} onRetry={() => { void reload(); void reloadTransfers() }} /><TransferRegister transfers={daily} customers={customers} selectedDate={selectedDate} onCreate={create} onUpdate={update} onDelete={setDeleting} onHistory={setHistory} />{deleting && <DeleteOperationDialog title="تأكيد حذف الحوالة" description={`سيُحذف حوالة الزبون ${deleting.customerNameSnapshot} بمبلغ ${formatNumber(deleting.amount)} ${deleting.currency}، وسيُعكس أثره من حساب الزبون.`} onConfirm={remove} onClose={() => setDeleting(null)} />}{history && <OperationHistoryDialog title="سجل تغييرات الحوالة" history={history.history} onClose={() => setHistory(null)} />}{showDeleted && <DeletedRecordsDialog title="الحوالات المحذوفة" records={transfers.filter((transfer) => transfer.isDeleted).map((record) => ({ kind: 'transfer', record }))} onHistory={(record) => { setShowDeleted(false); setHistory(record as Transfer) }} onClose={() => setShowDeleted(false)} />}{toast && <Toast message={toast} onClose={() => setToast(null)} />}</div>
}
