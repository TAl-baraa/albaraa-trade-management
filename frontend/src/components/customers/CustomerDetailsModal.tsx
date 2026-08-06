import type { Customer } from '../../types/customer'
import { formatDate } from '../../utils/formatters'
import { BalanceDisplay } from './BalanceDisplay'
import { Modal } from './Modal'

export function CustomerDetailsModal({ customer, onAccount, onClose }: { customer: Customer; onAccount: () => void; onClose: () => void }) {
  return <Modal title="تفاصيل حساب الزبون" onClose={onClose}><div className="details-heading"><h3>{customer.name}</h3><span className={`status-badge ${customer.isArchived ? 'status-badge--archived' : ''}`}>{customer.isArchived ? 'مؤرشف' : 'نشط'}</span></div><dl className="details-grid"><div><dt>رقم الهاتف</dt><dd dir="ltr">{customer.phone || '—'}</dd></div><div><dt>تاريخ إنشاء الحساب</dt><dd>{formatDate(customer.createdAt)}</dd></div><div><dt>رصيد الدينار</dt><dd><BalanceDisplay balance={customer.iqdBalance} currency="IQD" /></dd></div><div><dt>رصيد الدولار</dt><dd><BalanceDisplay balance={customer.usdBalance} currency="USD" /></dd></div><div><dt>آخر عملية شراء</dt><dd>{formatDate(customer.lastPurchaseDate)}</dd></div><div><dt>آخر دفعة</dt><dd>{formatDate(customer.lastPaymentDate)}</dd></div><div className="details-grid__wide"><dt>الملاحظات</dt><dd>{customer.notes || 'لا توجد ملاحظات'}</dd></div></dl><div className="modal__footer"><button className="button button--primary" type="button" onClick={onAccount}>فتح الحساب وكشف الحساب</button><button className="button button--secondary" type="button" onClick={onClose}>إغلاق</button></div></Modal>
}
