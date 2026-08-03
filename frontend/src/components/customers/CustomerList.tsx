import { Archive, Eye, FilePenLine, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react'
import type { Customer } from '../../types/customer'
import { formatDate } from '../../utils/formatters'
import { BalanceDisplay } from './BalanceDisplay'

interface CustomerListProps {
  customers: Customer[]; archived: boolean
  onOpen: (customer: Customer) => void; onEdit: (customer: Customer) => void
  onArchive: (customer: Customer) => void; onDelete: (customer: Customer) => void; onReactivate: (customer: Customer) => void
}

export function CustomerList({ customers, archived, onOpen, onEdit, onArchive, onDelete, onReactivate }: CustomerListProps) {
  if (customers.length === 0) return <div className="empty-state">لا توجد نتائج مطابقة.</div>
  return (
    <>
      <div className="table-wrap">
        <table><thead><tr>
          <th>التسلسل</th><th>اسم الزبون</th><th>رقم الهاتف</th><th>رصيد الدينار</th><th>رصيد الدولار</th>
          {archived ? <th>حالة الحساب</th> : <><th>آخر عملية شراء</th><th>آخر دفعة</th></>}
          <th>فتح الحساب</th>{!archived && <th>تعديل</th>}<th>{archived ? 'إعادة التفعيل' : 'إجراء الحساب'}</th>
        </tr></thead><tbody>
          {customers.map((customer, index) => <tr key={customer.id}>
            <td>{index + 1}</td><td className="customer-name">{customer.name}</td><td dir="ltr">{customer.phone || '—'}</td>
            <td><BalanceDisplay balance={customer.iqdBalance} currency="IQD" /></td><td><BalanceDisplay balance={customer.usdBalance} currency="USD" /></td>
            {archived ? <td>مؤرشف منذ {formatDate(customer.archivedAt)}</td> : <><td>{formatDate(customer.lastPurchaseDate)}</td><td>{formatDate(customer.lastPaymentDate)}</td></>}
            <td><button className="table-action" type="button" onClick={() => onOpen(customer)}><Eye size={17} />فتح</button></td>
            {!archived && <td><button className="table-action" type="button" onClick={() => onEdit(customer)}><FilePenLine size={17} />تعديل</button></td>}
            <td>{archived ? <button className="table-action" type="button" onClick={() => onReactivate(customer)}><RotateCcw size={17} />إعادة التفعيل</button> : <AccountActions customer={customer} onArchive={onArchive} onDelete={onDelete} />}</td>
          </tr>)}
        </tbody></table>
      </div>
      <div className="customer-cards">
        {customers.map((customer, index) => <article className="customer-card" key={customer.id}>
          <div className="customer-card__header"><div><span className="sequence">الزبون {index + 1}</span><h2>{customer.name}</h2><span dir="ltr">{customer.phone || '—'}</span></div><MoreHorizontal size={22} /></div>
          <dl><div><dt>رصيد الدينار</dt><dd><BalanceDisplay balance={customer.iqdBalance} currency="IQD" /></dd></div><div><dt>رصيد الدولار</dt><dd><BalanceDisplay balance={customer.usdBalance} currency="USD" /></dd></div>
          {archived ? <div><dt>حالة الحساب</dt><dd>مؤرشف منذ {formatDate(customer.archivedAt)}</dd></div> : <><div><dt>آخر عملية شراء</dt><dd>{formatDate(customer.lastPurchaseDate)}</dd></div><div><dt>آخر دفعة</dt><dd>{formatDate(customer.lastPaymentDate)}</dd></div></>}</dl>
          <div className="customer-card__actions"><button className="button button--secondary button--small" type="button" onClick={() => onOpen(customer)}><Eye size={17} />فتح الحساب</button>
          {archived ? <button className="button button--secondary button--small" type="button" onClick={() => onReactivate(customer)}><RotateCcw size={17} />إعادة التفعيل</button> : <><button className="button button--secondary button--small" type="button" onClick={() => onEdit(customer)}><FilePenLine size={17} />تعديل</button><AccountActions customer={customer} onArchive={onArchive} onDelete={onDelete} /></>}</div>
        </article>)}
      </div>
    </>
  )
}

function AccountActions({ customer, onArchive, onDelete }: { customer: Customer; onArchive: (customer: Customer) => void; onDelete: (customer: Customer) => void }) {
  const hasBalance = customer.iqdBalance !== 0 || customer.usdBalance !== 0
  if (hasBalance) return <span className="restriction" title="يجب تسديد الحساب بالكامل أولًا">يجب تسديد الحساب أولًا</span>
  return <div className="account-actions"><button className="icon-button" type="button" onClick={() => onArchive(customer)} aria-label={`أرشفة ${customer.name}`} title="أرشفة الزبون"><Archive size={18} /></button>{!customer.hasTransactionHistory && <button className="icon-button icon-button--danger" type="button" onClick={() => onDelete(customer)} aria-label={`حذف ${customer.name}`} title="حذف الزبون نهائيًا"><Trash2 size={18} /></button>}</div>
}
