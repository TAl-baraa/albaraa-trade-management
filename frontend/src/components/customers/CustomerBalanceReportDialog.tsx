import { Printer } from 'lucide-react'
import { useState } from 'react'
import type { CustomerBalanceReportFilter } from '../../services/customerBalancesReport'
import { Modal } from './Modal'

interface CustomerBalanceReportDialogProps {
  onConfirm: (filter: CustomerBalanceReportFilter) => void
  onClose: () => void
}

export function CustomerBalanceReportDialog({ onConfirm, onClose }: CustomerBalanceReportDialogProps) {
  const [filter, setFilter] = useState<CustomerBalanceReportFilter>('all')
  return <Modal title="طباعة أرصدة الزبائن" onClose={onClose}>
    <fieldset className="report-filter">
      <legend>اختر الزبائن المطلوب تضمينهم في التقرير</legend>
      <label><input type="radio" name="customer-balance-filter" value="all" checked={filter === 'all'} onChange={() => setFilter('all')} /><span><strong>جميع الزبائن</strong><small>يتضمن جميع الزبائن النشطين.</small></span></label>
      <label><input type="radio" name="customer-balance-filter" value="debtors" checked={filter === 'debtors'} onChange={() => setFilter('debtors')} /><span><strong>الزبائن المدينون فقط</strong><small>يتضمن من عليه مبلغ للمكتب بالدينار أو الدولار.</small></span></label>
    </fieldset>
    <div className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button--primary" type="button" onClick={() => onConfirm(filter)}><Printer size={18} />طباعة التقرير</button></div>
  </Modal>
}
